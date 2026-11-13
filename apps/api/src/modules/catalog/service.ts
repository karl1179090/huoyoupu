import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { parseSchema, type SchemaName, type SchemaValue } from '@huoyoupu/contracts';
import { AppError } from '../../lib/errors.js';
import { generateMnemonic, normalizeMnemonicOverride } from './mnemonic.js';

type Sql = Pick<Pool | PoolClient, 'query'>;
type ProductCreate = SchemaValue<'ProductCreate'>;
const readModels = { Product: 'catalog_products', Unit: 'catalog_units', Customer: 'catalog_customers', Address: 'catalog_addresses', Warehouse: 'catalog_warehouses' } as const;
type ReadModel = keyof typeof readModels;
function fail(code: string, status: number, message: string): never { throw new AppError(code, status, message); }
function nonempty(value: string, field: string): string {
  const result = value.trim();
  if (!result) fail('INVALID_REQUEST', 400, `${field}不能为空`);
  return result;
}
function mnemonicOverride(value: string | null | undefined): string | null {
  try { return normalizeMnemonicOverride(value); } catch { return fail('INVALID_REQUEST', 400, '助记码校正至少包含一个英文字母或数字'); }
}
function changes(input: Record<string, unknown>): void {
  if (!Object.keys(input).some(key => key !== 'expectedVersion')) fail('INVALID_REQUEST', 400, '没有实际变更');
}
async function lock(client: PoolClient, table: 'products' | 'product_units' | 'customers' | 'customer_addresses' | 'warehouses', id: string, version?: number): Promise<Record<string, unknown>> {
  const result = await client.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [id]);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) fail('NOT_FOUND', 404, '资料不存在');
  if (version !== undefined && Number(row.version) !== version) throw new AppError('VERSION_CONFLICT', 409, '资料已被修改，请刷新', { expectedVersion: version, actualVersion: Number(row.version) });
  return row;
}
export async function getCatalog<N extends ReadModel>(sql: Sql, name: N, id: string): Promise<SchemaValue<N>> {
  const result = await sql.query<{ data: unknown }>(`SELECT data FROM ${readModels[name]} WHERE id=$1`, [id]);
  if (!result.rows[0]) fail('NOT_FOUND', 404, '资料不存在');
  return parseSchema(name, result.rows[0].data);
}
async function belongs(client: PoolClient, productId: string, unitId: string): Promise<void> {
  const result = await client.query('SELECT id FROM product_units WHERE id=$1 AND product_id=$2', [unitId, productId]);
  if (!result.rowCount) fail('NOT_FOUND', 404, '单位不属于该商品');
}
async function update(client: PoolClient, table: string, id: string, fields: Record<string, unknown>): Promise<void> {
  if (!Object.keys(fields).length) fail('INVALID_REQUEST', 400, '没有实际变更');
  const columns = Object.keys(fields);
  const result = await client.query(`UPDATE ${table} SET ${columns.map((key, index) => `${key}=$${index + 2}`).join(',')},version=version+1,updated_at=now() WHERE id=$1 AND (${columns.map((key, index) => `${key} IS DISTINCT FROM $${index + 2}`).join(' OR ')}) RETURNING id`, [id, ...Object.values(fields)]);
  if (!result.rowCount) fail('INVALID_REQUEST', 400, '没有实际变更');
}
function mapped(input: object, columns: Record<string, string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([key]) => columns[key]).map(([key, value]) => [columns[key]!, typeof value === 'string' && ['name', 'address', 'contactName'].includes(key) ? nonempty(value, key) : value]));
}

export async function createProduct(client: PoolClient, input: ProductCreate): Promise<SchemaValue<'Product'>> {
  const productId = randomUUID(); const baseUnitId = randomUUID();
  const name = nonempty(input.name, '商品名'); const generated = generateMnemonic(name); const override = mnemonicOverride(input.mnemonicCodeOverride);
  const units = [{ ...input.baseUnit, multiplierBase: 1 }, ...(input.units ?? [])];
  const unitNames = units.map(unit => nonempty(unit.name, '单位名'));
  if (new Set(unitNames).size !== unitNames.length) fail('INVALID_REQUEST', 400, '商品内单位名称不能重复');
  await client.query('INSERT INTO products(id,code,name,specification,brand,generated_mnemonic,mnemonic_override,effective_mnemonic,base_unit_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [productId, nonempty(input.code, '编码'), name, input.specification ?? '', input.brand ?? '', generated, override, override ?? generated, baseUnitId]);
  const unitIds = new Map<string, string>();
  for (const [index, unit] of units.entries()) {
    const id = index === 0 ? baseUnitId : randomUUID(); unitIds.set(unitNames[index]!, id);
    await client.query('INSERT INTO product_units(id,product_id,name,multiplier_base,default_sale_price,default_receipt_cost) VALUES($1,$2,$3,$4,$5,$6)', [id, productId, unitNames[index], unit.multiplierBase, unit.defaultSalePrice, unit.defaultReceiptCost ?? null]);
  }
  for (const barcode of input.barcodes ?? []) {
    const unitId = unitIds.get(barcode.unitName.trim()); if (!unitId) fail('INVALID_REQUEST', 400, '条码引用了不存在的单位名称');
    await client.query('INSERT INTO product_barcodes(barcode_value,product_id,unit_id) VALUES($1,$2,$3)', [nonempty(barcode.value, '条码'), productId, unitId]);
  }
  return getCatalog(client, 'Product', productId);
}

export async function patchProduct(client: PoolClient, productId: string, input: SchemaValue<'ProductPatch'>): Promise<SchemaValue<'Product'>> {
  changes(input); const before = await lock(client, 'products', productId, input.expectedVersion);
  const fields = mapped(input, { name: 'name', specification: 'specification', brand: 'brand', active: 'active' });
  if (input.name !== undefined && nonempty(input.name, '商品名') !== before.name) {
    const generated = generateMnemonic(input.name); const override = mnemonicOverride(input.mnemonicCodeOverride);
    Object.assign(fields, { generated_mnemonic: generated, mnemonic_override: override, effective_mnemonic: override ?? generated });
  } else if (Object.hasOwn(input, 'mnemonicCodeOverride')) {
    const override = mnemonicOverride(input.mnemonicCodeOverride);
    Object.assign(fields, { mnemonic_override: override, effective_mnemonic: override ?? before.generated_mnemonic });
  }
  await update(client, 'products', productId, fields); return getCatalog(client, 'Product', productId);
}

export async function createUnit(client: PoolClient, productId: string, input: SchemaValue<'UnitCreate'>): Promise<SchemaValue<'Unit'>> {
  await lock(client, 'products', productId);
  const id = randomUUID();
  await client.query('INSERT INTO product_units(id,product_id,name,multiplier_base,default_sale_price,default_receipt_cost) VALUES($1,$2,$3,$4,$5,$6)', [id, productId, nonempty(input.name, '单位名'), input.multiplierBase, input.defaultSalePrice, input.defaultReceiptCost ?? null]);
  await client.query('UPDATE products SET version=version+1,updated_at=now() WHERE id=$1', [productId]);
  return getCatalog(client, 'Unit', id);
}

/** Discover real FK references from transactional tables, including modules added later. */
export async function unitHasTransactions(client: PoolClient, unitId: string): Promise<boolean> {
  const references = await client.query<{ schema_name: string; table_name: string; column_name: string }>(`
    SELECT ns.nspname AS schema_name, rel.relname AS table_name, attr.attname AS column_name
    FROM pg_constraint c JOIN pg_class rel ON rel.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=rel.relnamespace
    JOIN LATERAL unnest(c.conkey,c.confkey) AS k(local_col,foreign_col) ON true
    JOIN pg_attribute attr ON attr.attrelid=c.conrelid AND attr.attnum=k.local_col
    JOIN pg_attribute target ON target.attrelid=c.confrelid AND target.attnum=k.foreign_col
    WHERE c.contype='f' AND c.confrelid='product_units'::regclass AND target.attname='id'
      AND rel.relname NOT IN ('products','product_barcodes','customer_price_rules')`);
  const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;
  for (const reference of references.rows) {
    const result = await client.query(`SELECT 1 FROM ${quote(reference.schema_name)}.${quote(reference.table_name)} WHERE ${quote(reference.column_name)}=$1 LIMIT 1`, [unitId]);
    if (result.rowCount) return true;
  }
  return false;
}

export async function patchUnit(client: PoolClient, productId: string, unitId: string, input: SchemaValue<'UnitPatch'>): Promise<SchemaValue<'Unit'>> {
  changes(input); const product = await lock(client, 'products', productId); await belongs(client, productId, unitId);
  const before = await lock(client, 'product_units', unitId, input.expectedVersion);
  if (input.multiplierBase !== undefined && input.multiplierBase !== Number(before.multiplier_base)) {
    if (product.base_unit_id === unitId || await unitHasTransactions(client, unitId)) fail('UNIT_REFERENCED', 422, '基础单位或已有交易的换算倍率不能更改');
  }
  await update(client, 'product_units', unitId, mapped(input, { name: 'name', multiplierBase: 'multiplier_base', defaultSalePrice: 'default_sale_price', defaultReceiptCost: 'default_receipt_cost', active: 'active' }));
  await client.query('UPDATE products SET version=version+1,updated_at=now() WHERE id=$1', [productId]);
  return getCatalog(client, 'Unit', unitId);
}

export async function replaceBarcodes(client: PoolClient, productId: string, input: SchemaValue<'BarcodeUpdate'>): Promise<SchemaValue<'Product'>> {
  await lock(client, 'products', productId, input.expectedVersion);
  for (const barcode of input.barcodes) await belongs(client, productId, barcode.unitId);
  await client.query('DELETE FROM product_barcodes WHERE product_id=$1', [productId]);
  for (const barcode of input.barcodes) await client.query('INSERT INTO product_barcodes(barcode_value,product_id,unit_id) VALUES($1,$2,$3)', [nonempty(barcode.value, '条码'), productId, barcode.unitId]);
  await client.query('UPDATE products SET version=version+1,updated_at=now() WHERE id=$1', [productId]);
  return getCatalog(client, 'Product', productId);
}

export async function createCustomer(client: PoolClient, input: SchemaValue<'CustomerInput'>): Promise<SchemaValue<'Customer'>> {
  const id = randomUUID();
  await client.query('INSERT INTO customers(id,code,name,contact_name,phone,notes) VALUES($1,$2,$3,$4,$5,$6)', [id, nonempty(input.code, '客户编码'), nonempty(input.name, '客户名'), input.contactName ?? '', input.phone ?? '', input.notes ?? '']);
  return getCatalog(client, 'Customer', id);
}
export async function patchCustomer(client: PoolClient, id: string, input: SchemaValue<'CustomerPatch'>): Promise<SchemaValue<'Customer'>> {
  changes(input); await lock(client, 'customers', id, input.expectedVersion);
  await update(client, 'customers', id, mapped(input, { name: 'name', contactName: 'contact_name', phone: 'phone', notes: 'notes', active: 'active' }));
  return getCatalog(client, 'Customer', id);
}
async function clearDefault(client: PoolClient, customerId: string, exceptId: string): Promise<void> {
  await client.query('UPDATE customer_addresses SET is_default=false,version=version+1,updated_at=now() WHERE customer_id=$1 AND id<>$2 AND is_default', [customerId, exceptId]);
}
export async function createAddress(client: PoolClient, customerId: string, input: SchemaValue<'AddressInput'>): Promise<SchemaValue<'Address'>> {
  await lock(client, 'customers', customerId);
  const id = randomUUID(); if (input.isDefault) await clearDefault(client, customerId, id);
  await client.query('INSERT INTO customer_addresses(id,customer_id,label,contact_name,phone,address,is_default) VALUES($1,$2,$3,$4,$5,$6,$7)', [id, customerId, input.label ?? '', nonempty(input.contactName, '联系人'), input.phone ?? '', nonempty(input.address, '地址'), input.isDefault ?? false]);
  await client.query('UPDATE customers SET version=version+1,updated_at=now() WHERE id=$1', [customerId]);
  return getCatalog(client, 'Address', id);
}
export async function patchAddress(client: PoolClient, customerId: string, addressId: string, input: SchemaValue<'AddressPatch'>): Promise<SchemaValue<'Address'>> {
  changes(input); await lock(client, 'customers', customerId);
  const existing = await lock(client, 'customer_addresses', addressId);
  if (existing.customer_id !== customerId) fail('NOT_FOUND', 404, '地址不属于该客户');
  if (Number(existing.version) !== input.expectedVersion) throw new AppError('VERSION_CONFLICT', 409, '地址已被修改，请刷新', { expectedVersion: input.expectedVersion, actualVersion: Number(existing.version) });
  const fields = mapped(input, { label: 'label', contactName: 'contact_name', phone: 'phone', address: 'address', isDefault: 'is_default', active: 'active' });
  if (input.active === false) fields.is_default = false;
  if (input.isDefault === true && (input.active ?? existing.active) === false) fail('INVALID_REQUEST', 400, '停用地址不能作为默认地址');
  if (input.isDefault) await clearDefault(client, customerId, addressId);
  await update(client, 'customer_addresses', addressId, fields);
  await client.query('UPDATE customers SET version=version+1,updated_at=now() WHERE id=$1', [customerId]);
  return getCatalog(client, 'Address', addressId);
}

/** Resolve at creation time only; callers persist this returned value as a snapshot. */
export async function resolveDeliverySnapshot(sql: Sql, customerId: string, addressId?: string, supplied?: SchemaValue<'AddressSnapshot'>): Promise<SchemaValue<'AddressSnapshot'>> {
  const customer = await getCatalog(sql, 'Customer', customerId);
  if (!customer.active) fail('RELATED_RECORD_CONFLICT', 409, '停用客户不能用于新增交易');
  if (addressId && supplied) fail('INVALID_REQUEST', 400, '地址和配送快照不能同时指定');
  if (supplied) return parseSchema('AddressSnapshot', structuredClone(supplied));
  const address = addressId ? customer.addresses.find(value => value.id === addressId) : customer.addresses.find(value => value.active && value.isDefault);
  if (!address || !address.active) fail('NOT_FOUND', 404, '没有有效配送地址，请选择地址或填写快照');
  return parseSchema('AddressSnapshot', { customerName: customer.name, contactName: address.contactName, phone: address.phone, address: address.address });
}

export async function createWarehouse(client: PoolClient, input: SchemaValue<'WarehouseInput'>): Promise<SchemaValue<'Warehouse'>> {
  const id = randomUUID();
  await client.query('INSERT INTO warehouses(id,code,name) VALUES($1,$2,$3)', [id, nonempty(input.code, '仓库编码'), nonempty(input.name, '仓库名')]);
  return getCatalog(client, 'Warehouse', id);
}
export async function patchWarehouse(client: PoolClient, id: string, input: SchemaValue<'WarehousePatch'>): Promise<SchemaValue<'Warehouse'>> {
  changes(input); await lock(client, 'warehouses', id, input.expectedVersion);
  await update(client, 'warehouses', id, mapped(input, { name: 'name', active: 'active' }));
  return getCatalog(client, 'Warehouse', id);
}

export async function upsertPriceRule(client: PoolClient, customerId: string, productId: string, unitId: string, input: SchemaValue<'PriceRuleInput'>): Promise<SchemaValue<'PriceRule'>> {
  await lock(client, 'customers', customerId); await lock(client, 'products', productId); await belongs(client, productId, unitId);
  const existing = await client.query<{ version: string }>('SELECT version FROM customer_price_rules WHERE customer_id=$1 AND product_id=$2 AND unit_id=$3 FOR UPDATE', [customerId, productId, unitId]);
  const version = Number(existing.rows[0]?.version ?? 0);
  if (version !== input.expectedVersion) throw new AppError('VERSION_CONFLICT', 409, '价格规则已被修改，请刷新', { expectedVersion: input.expectedVersion, actualVersion: version });
  if (version === 0) await client.query('INSERT INTO customer_price_rules(customer_id,product_id,unit_id,unit_price) VALUES($1,$2,$3,$4)', [customerId, productId, unitId, input.unitPrice]);
  else {
    const changed = await client.query('UPDATE customer_price_rules SET unit_price=$4,version=version+1,updated_at=now() WHERE customer_id=$1 AND product_id=$2 AND unit_id=$3 AND unit_price IS DISTINCT FROM $4 RETURNING unit_id', [customerId, productId, unitId, input.unitPrice]);
    if (!changed.rowCount) fail('INVALID_REQUEST', 400, '没有实际变更');
  }
  const result = await client.query<{ data: unknown }>('SELECT data FROM catalog_price_rules WHERE customer_id=$1 AND product_id=$2 AND unit_id=$3', [customerId, productId, unitId]);
  return parseSchema('PriceRule', result.rows[0]!.data);
}
export async function deletePriceRule(client: PoolClient, customerId: string, productId: string, unitId: string, expectedVersion: number): Promise<void> {
  await lock(client, 'customers', customerId); await belongs(client, productId, unitId);
  const result = await client.query<{ version: string }>('SELECT version FROM customer_price_rules WHERE customer_id=$1 AND product_id=$2 AND unit_id=$3 FOR UPDATE', [customerId, productId, unitId]);
  if (!result.rows[0]) fail('NOT_FOUND', 404, '价格规则不存在');
  if (Number(result.rows[0].version) !== expectedVersion) fail('VERSION_CONFLICT', 409, '价格规则已被修改');
  await client.query('DELETE FROM customer_price_rules WHERE customer_id=$1 AND product_id=$2 AND unit_id=$3', [customerId, productId, unitId]);
}

export interface HistoricalPrice {
  unitPrice: string; sourceOrderId: string; sourceRevisionId: string; sourceLineId: string; sourceConfirmedAt: string; sourceNetAmount: string;
}
export type HistoricalPriceLookup = (sql: Sql, customerId: string, productId: string, unitId: string) => Promise<HistoricalPrice | undefined>;
/** The history provider is mandatory; absence of sales integration must not silently become "no history". */
export async function quoteCustomerPrice(sql: Sql, customerId: string, productId: string, unitId: string, history: HistoricalPriceLookup): Promise<SchemaValue<'PriceQuote'>> {
  await getCatalog(sql, 'Customer', customerId);
  const unit = await getCatalog(sql, 'Unit', unitId);
  if (unit.productId !== productId) fail('NOT_FOUND', 404, '单位不属于该商品');
  const previous = await history(sql, customerId, productId, unitId);
  if (previous) return parseSchema('PriceQuote', { ...previous, source: 'history' });
  const rule = await sql.query<{ unit_price: string }>('SELECT unit_price FROM customer_price_rules WHERE customer_id=$1 AND product_id=$2 AND unit_id=$3', [customerId, productId, unitId]);
  return parseSchema('PriceQuote', { unitPrice: rule.rows[0]?.unit_price ?? unit.defaultSalePrice, source: rule.rows[0] ? 'customer_rule' : 'default', sourceOrderId: null, sourceRevisionId: null, sourceLineId: null, sourceConfirmedAt: null, sourceNetAmount: null });
}

export interface ListOptions { cursor?: string; limit?: number; q?: string; includeInactive?: boolean }
function like(value: string): string { return `%${value.replace(/[\\%_]/g, '\\$&')}%`; }
function decodeCursor(cursor: string | undefined, scope: string): string | undefined {
  if (!cursor) return undefined;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (!Array.isArray(decoded) || decoded.length !== 2 || decoded[0] !== scope || typeof decoded[1] !== 'string') throw new Error();
    return decoded[1];
  } catch { return fail('INVALID_REQUEST', 400, '分页游标无效或查询条件已变更'); }
}
function encodeCursor(scope: string, key: string): string { return Buffer.from(JSON.stringify([scope, key])).toString('base64url'); }
export async function listCatalog(sql: Sql, kind: 'Product' | 'Customer' | 'Warehouse', options: ListOptions = {}): Promise<SchemaValue<'ProductPage'> | SchemaValue<'CustomerPage'> | SchemaValue<'WarehousePage'>> {
  const limit = options.limit ?? 50;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) fail('INVALID_REQUEST', 400, '分页数量无效');
  const scope = JSON.stringify([kind, options.q ?? '', options.includeInactive ?? false]);
  const after = decodeCursor(options.cursor, scope);
  if (after) parseSchema('Id', after);
  const query = like(options.q ?? '');
  let result;
  if (kind === 'Product') result = await sql.query<{ id: string; data: unknown }>(`
    SELECT p.id,v.data FROM products p JOIN catalog_products v ON v.id=p.id
    WHERE ($1::uuid IS NULL OR p.id>$1::uuid) AND ($2::boolean OR p.active)
    AND ($3='' OR p.name ILIKE $4 OR p.code ILIKE $4 OR p.effective_mnemonic ILIKE $4
      OR EXISTS(SELECT 1 FROM product_barcodes b WHERE b.product_id=p.id AND b.barcode_value ILIKE $4))
    ORDER BY p.id LIMIT $5`, [after ?? null, options.includeInactive ?? false, options.q ?? '', query, limit + 1]);
  else {
    const table = kind === 'Customer' ? 'customers' : 'warehouses';
    result = await sql.query<{ id: string; data: unknown }>(`SELECT t.id,v.data FROM ${table} t JOIN ${readModels[kind]} v ON v.id=t.id WHERE ($1::uuid IS NULL OR t.id>$1::uuid) AND ($2='' OR t.name ILIKE $3 OR t.code ILIKE $3) ORDER BY t.id LIMIT $4`, [after ?? null, options.q ?? '', query, limit + 1]);
  }
  const page = result.rows.slice(0, limit);
  return parseSchema(`${kind}Page`, { items: page.map(row => row.data), nextCursor: result.rows.length > limit ? encodeCursor(scope, page.at(-1)!.id) : null, asOf: new Date().toISOString() });
}
export async function listPriceRules(sql: Sql, customerId: string, options: ListOptions = {}): Promise<SchemaValue<'PriceRulePage'>> {
  await getCatalog(sql, 'Customer', customerId);
  const limit = options.limit ?? 50;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) fail('INVALID_REQUEST', 400, '分页数量无效');
  const scope = `priceRules:${customerId}`; const after = decodeCursor(options.cursor, scope);
  const result = await sql.query<{ cursor_key: string; data: unknown }>(`SELECT product_id::text||':'||unit_id::text AS cursor_key,data FROM catalog_price_rules WHERE customer_id=$1 AND ($2::text IS NULL OR product_id::text||':'||unit_id::text>$2) ORDER BY product_id,unit_id LIMIT $3`, [customerId, after ?? null, limit + 1]);
  const page = result.rows.slice(0, limit);
  return parseSchema('PriceRulePage', { items: page.map(row => row.data), nextCursor: result.rows.length > limit ? encodeCursor(scope, page.at(-1)!.cursor_key) : null, asOf: new Date().toISOString() });
}
