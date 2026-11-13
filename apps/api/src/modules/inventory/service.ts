import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { amountForBaseQuantity, allocateFromSource, formatMoney, parseMoney, parseUnitPrice, quantity, toBaseQuantity } from '@huoyoupu/money';
import { parseSchema, type SchemaValue } from '@huoyoupu/contracts';
import { AppError } from '../../lib/errors.js';
import type { OperationContext } from '../../lib/security.js';
import { changeBatch, inventoryError, lockBatches, lockStockBalances, recordMovement, safeNumber, type BatchRow, type StockKey } from './stock.js';

type Sql = Pick<Pool | PoolClient, 'query'>;
type UnitRow = { id: string; product_id: string; multiplier_base: string; active: boolean; product_active: boolean };
function noFuture(value: string): Date {
  parseSchema('Instant', value); const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now()) throw new AppError('INVALID_REQUEST', 400, '实际发生时间不能晚于当前时间');
  return date;
}
async function validWarehouse(client: PoolClient, id: string): Promise<void> {
  const result = await client.query<{ active: boolean }>('SELECT active FROM warehouses WHERE id=$1', [id]);
  if (!result.rows[0]) throw new AppError('NOT_FOUND', 404, '仓库不存在');
  if (!result.rows[0].active) throw new AppError('RELATED_RECORD_CONFLICT', 409, '仓库已停用');
}
async function unit(client: PoolClient, productId: string, unitId: string): Promise<UnitRow> {
  // Metadata locks prevent a concurrent multiplier change between validation and FK creation.
  const result = await client.query<UnitRow>('SELECT u.id,u.product_id,u.multiplier_base,u.active,p.active AS product_active FROM product_units u JOIN products p ON p.id=u.product_id WHERE u.id=$1 AND u.product_id=$2 FOR SHARE OF p,u', [unitId, productId]);
  if (!result.rows[0]) throw new AppError('NOT_FOUND', 404, '单位不属于该商品');
  if (!result.rows[0].active || !result.rows[0].product_active) throw new AppError('RELATED_RECORD_CONFLICT', 409, '商品或单位已停用');
  return result.rows[0];
}
const models = { Receipt: 'inventory_receipt_data', Batch: 'inventory_batch_data', Stocktake: 'inventory_stocktake_data' } as const;
export async function getInventory<N extends keyof typeof models>(sql: Sql, name: N, id: string): Promise<SchemaValue<N>> {
  const result = await sql.query<{ data: unknown }>(`SELECT data FROM ${models[name]} WHERE id=$1`, [id]);
  if (!result.rows[0]) throw new AppError('NOT_FOUND', 404, '库存单据或批次不存在');
  return parseSchema(name, result.rows[0].data);
}

async function insertBatch(context: OperationContext, input: { productId: string; warehouseId: string; sourceKind: 'receipt' | 'stocktake_gain'; sourceLineId: string; receivedAt: Date; unitId: string; multiplier: bigint; inputCost: string; quantityBase: bigint; cost: bigint }): Promise<BatchRow> {
  const id = randomUUID();
  const result = await context.client.query<BatchRow>(`INSERT INTO inventory_batches(id,product_id,warehouse_id,source_kind,receipt_line_id,stocktake_line_id,received_at,cost_unit_id,multiplier_snapshot,input_unit_cost,initial_quantity_base,remaining_quantity_base,initial_cost_amount,remaining_cost_amount)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12,$12) RETURNING *`, [id, input.productId, input.warehouseId, input.sourceKind, input.sourceKind === 'receipt' ? input.sourceLineId : null, input.sourceKind === 'stocktake_gain' ? input.sourceLineId : null, input.receivedAt, input.unitId, input.multiplier.toString(), input.inputCost, input.quantityBase.toString(), formatMoney(input.cost)]);
  return result.rows[0]!;
}

export async function createReceipt(context: OperationContext, input: SchemaValue<'ReceiptInput'>): Promise<SchemaValue<'Receipt'>> {
  parseSchema('ReceiptInput', input); const receivedAt = noFuture(input.receivedAt); await validWarehouse(context.client, input.warehouseId);
  const inputs: { line: SchemaValue<'ReceiptLineInput'>; unit: UnitRow }[] = [];
  // Sort metadata locks by product/unit so independent receipts cannot invert their lock order.
  const loaded = new Map<string, UnitRow>();
  for (const line of [...input.lines].sort((a, b) => `${a.productId}:${a.unitId}`.toLowerCase().localeCompare(`${b.productId}:${b.unitId}`.toLowerCase()))) loaded.set(`${line.productId}:${line.unitId}`, await unit(context.client, line.productId, line.unitId));
  for (const line of input.lines) inputs.push({ line, unit: loaded.get(`${line.productId}:${line.unitId}`)! });
  await lockStockBalances(context.client, input.lines.map(line => ({ productId: line.productId, warehouseId: input.warehouseId })));
  const receiptId = randomUUID();
  await context.client.query('INSERT INTO receipts(id,receipt_no,kind,warehouse_id,supplier_reference,received_at,operator_id,operation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [receiptId, `RK-${receiptId}`, input.kind, input.warehouseId, input.supplierReference ?? '', receivedAt, context.actor.id, context.operationId]);
  for (const { line, unit: selectedUnit } of inputs) {
    const lineId = randomUUID(); const multiplier = BigInt(selectedUnit.multiplier_base); const count = toBaseQuantity(line.quantity, multiplier);
    const cost = amountForBaseQuantity(parseUnitPrice(line.unitCost), multiplier, count);
    await context.client.query('INSERT INTO receipt_lines(id,receipt_id,product_id,unit_id,quantity,multiplier_snapshot,quantity_base,input_unit_cost,cost_amount) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [lineId, receiptId, line.productId, line.unitId, line.quantity, multiplier.toString(), count.toString(), line.unitCost, formatMoney(cost)]);
    const batch = await insertBatch(context, { productId: line.productId, warehouseId: input.warehouseId, sourceKind: 'receipt', sourceLineId: lineId, receivedAt, unitId: line.unitId, multiplier, inputCost: line.unitCost, quantityBase: count, cost });
    await recordMovement(context, { batch, quantityDelta: count, costDelta: cost, sourceKind: input.kind === 'opening' ? 'opening_receipt' : 'purchase_receipt', sourceId: receiptId, sourceLineId: lineId, effectSlot: 'receipt' });
  }
  return getInventory(context.client, 'Receipt', receiptId);
}

interface StocktakeRow { id: string; warehouse_id: string; counted_at: Date; status: 'draft' | 'confirmed'; version: string }
interface StocktakeLineRow { id: string; product_id: string; batch_id: string | null; snapshot_quantity_base: string; snapshot_batch_version: string | null; snapshot_stock_version: string; actual_quantity_base: string | null; difference_base: string | null; gain_cost_unit_id: string | null; gain_unit_cost: string | null }
async function lockStocktake(client: PoolClient, id: string, expectedVersion: number): Promise<StocktakeRow> {
  const result = await client.query<StocktakeRow>('SELECT * FROM stocktakes WHERE id=$1 FOR UPDATE', [id]);
  const row = result.rows[0]; if (!row) throw new AppError('NOT_FOUND', 404, '盘点单不存在');
  if (Number(row.version) !== expectedVersion) throw new AppError('VERSION_CONFLICT', 409, '盘点版本已变更', { expectedVersion, actualVersion: Number(row.version) });
  if (row.status !== 'draft') inventoryError('ORDER_STATE_CONFLICT', '盘点已确认，不能再次修改或确认');
  return row;
}
export async function createStocktake(context: OperationContext, input: SchemaValue<'StocktakeCreate'>): Promise<SchemaValue<'Stocktake'>> {
  parseSchema('StocktakeCreate', input); await validWarehouse(context.client, input.warehouseId);
  const countedAt = input.countedAt ? noFuture(input.countedAt) : new Date();
  const keys = input.lines.map(line => ({ productId: line.productId, warehouseId: input.warehouseId }));
  await lockStockBalances(context.client, keys); const batches = await lockBatches(context.client, keys);
  if (new Set(input.lines.map(line => `${line.productId}:${line.batchId}`)).size !== input.lines.length) throw new AppError('INVALID_REQUEST', 400, '盘点批次不能重复');
  const stocktakeId = randomUUID();
  await context.client.query('INSERT INTO stocktakes(id,stocktake_no,warehouse_id,counted_at,operator_id,operation_id) VALUES($1,$2,$3,$4,$5,$6)', [stocktakeId, `PD-${stocktakeId}`, input.warehouseId, countedAt, context.actor.id, context.operationId]);
  for (const line of input.lines) {
    const balance = await context.client.query<{ quantity_base: string; version: string }>('SELECT quantity_base,version FROM stock_balances WHERE product_id=$1 AND warehouse_id=$2', [line.productId, input.warehouseId]);
    const batch = line.batchId ? batches.rows.find(batch => batch.id === line.batchId!.toLowerCase() && batch.product_id === line.productId.toLowerCase() && batch.warehouse_id === input.warehouseId.toLowerCase()) : undefined;
    if (line.batchId && !batch) throw new AppError('NOT_FOUND', 404, '批次不属于该商品仓库');
    if (!line.batchId && BigInt(balance.rows[0]!.quantity_base) !== 0n) inventoryError('STOCKTAKE_STALE', '无批次盘盈行仅适用于账面库存为零的商品');
    await context.client.query('INSERT INTO stocktake_lines(id,stocktake_id,product_id,batch_id,snapshot_quantity_base,snapshot_batch_version,snapshot_stock_version) VALUES($1,$2,$3,$4,$5,$6,$7)', [randomUUID(), stocktakeId, line.productId, line.batchId, batch?.remaining_quantity_base ?? '0', batch?.version ?? null, balance.rows[0]!.version]);
  }
  return getInventory(context.client, 'Stocktake', stocktakeId);
}
export async function patchStocktake(context: OperationContext, stocktakeId: string, input: SchemaValue<'StocktakePatch'>): Promise<SchemaValue<'Stocktake'>> {
  parseSchema('StocktakePatch', input); const header = await lockStocktake(context.client, stocktakeId, input.expectedVersion);
  const countedAt = input.countedAt ? noFuture(input.countedAt) : header.counted_at;
  if (new Set(input.lines.map(line => line.id)).size !== input.lines.length) throw new AppError('INVALID_REQUEST', 400, '盘点行不能重复');
  let changed = countedAt.getTime() !== header.counted_at.getTime();
  for (const line of input.lines) {
    const selected = await context.client.query<StocktakeLineRow>('SELECT * FROM stocktake_lines WHERE id=$1 AND stocktake_id=$2', [line.id, stocktakeId]);
    if (!selected.rows[0]) throw new AppError('NOT_FOUND', 404, '盘点行不属于该单据');
    const row = selected.rows[0];
    if (line.gainCostUnitId) await unit(context.client, row.product_id, line.gainCostUnitId);
    const costUnit = line.gainCostUnitId ?? row.gain_cost_unit_id; const cost = line.gainUnitCost ?? row.gain_unit_cost;
    const result = await context.client.query('UPDATE stocktake_lines SET actual_quantity_base=$2,gain_cost_unit_id=$3,gain_unit_cost=$4 WHERE id=$1 AND (actual_quantity_base IS DISTINCT FROM $2 OR gain_cost_unit_id IS DISTINCT FROM $3 OR gain_unit_cost IS DISTINCT FROM $4) RETURNING id', [line.id, line.actualQuantityBase, costUnit, cost]);
    if (result.rowCount) changed = true;
  }
  if (!changed) throw new AppError('INVALID_REQUEST', 400, '没有实际变更');
  await context.client.query('UPDATE stocktakes SET counted_at=$2,version=version+1 WHERE id=$1', [stocktakeId, countedAt]);
  return getInventory(context.client, 'Stocktake', stocktakeId);
}

export async function confirmStocktake(context: OperationContext, stocktakeId: string, expectedVersion: number): Promise<SchemaValue<'Stocktake'>> {
  parseSchema('Version', expectedVersion); const header = await lockStocktake(context.client, stocktakeId, expectedVersion);
  const lines = await context.client.query<StocktakeLineRow>('SELECT * FROM stocktake_lines WHERE stocktake_id=$1 ORDER BY id', [stocktakeId]);
  const keys: StockKey[] = lines.rows.map(line => ({ productId: line.product_id, warehouseId: header.warehouse_id }));
  // Cost unit references must be locked before stock anchors, consistently with receipt writes.
  const costUnits = new Map<string, UnitRow>();
  for (const line of [...lines.rows].filter(line => line.gain_cost_unit_id).sort((a, b) => `${a.product_id}:${a.gain_cost_unit_id}`.localeCompare(`${b.product_id}:${b.gain_cost_unit_id}`))) costUnits.set(line.id, await unit(context.client, line.product_id, line.gain_cost_unit_id!));
  await lockStockBalances(context.client, keys); const batches = await lockBatches(context.client, keys);
  for (const line of lines.rows) {
    if (line.actual_quantity_base === null) throw new AppError('INVALID_REQUEST', 400, '所有盘点行必须填写实盘数量');
    const batch = line.batch_id ? batches.rows.find(batch => batch.id === line.batch_id) : undefined;
    const balance = await context.client.query<{ version: string }>('SELECT version FROM stock_balances WHERE product_id=$1 AND warehouse_id=$2', [line.product_id, header.warehouse_id]);
    if (line.batch_id ? !batch || batch.version !== line.snapshot_batch_version : balance.rows[0]!.version !== line.snapshot_stock_version) inventoryError('STOCKTAKE_STALE', '盘点后相关库存已变更，请重新建立快照');
    const difference = BigInt(line.actual_quantity_base) - BigInt(line.snapshot_quantity_base);
    if (difference > 0n && (!line.gain_cost_unit_id || line.gain_unit_cost === null)) throw new AppError('INVALID_REQUEST', 400, '盘盈必须填写成本单位与实际单位成本');
  }
  for (const line of lines.rows) {
    const difference = BigInt(line.actual_quantity_base!) - BigInt(line.snapshot_quantity_base);
    if (!difference) continue;
    let batch = batches.rows.find(batch => batch.id === line.batch_id);
    let cost: bigint;
    if (difference > 0n) {
      const selectedUnit = costUnits.get(line.id)!; const multiplier = BigInt(selectedUnit.multiplier_base);
      cost = amountForBaseQuantity(parseUnitPrice(line.gain_unit_cost!), multiplier, difference);
      batch = await insertBatch(context, { productId: line.product_id, warehouseId: header.warehouse_id, sourceKind: 'stocktake_gain', sourceLineId: line.id, receivedAt: header.counted_at, unitId: line.gain_cost_unit_id!, multiplier, inputCost: line.gain_unit_cost!, quantityBase: difference, cost });
      await recordMovement(context, { batch, quantityDelta: difference, costDelta: cost, sourceKind: 'stocktake_gain', sourceId: stocktakeId, sourceLineId: line.id, effectSlot: 'stocktake' });
    } else {
      if (!batch) inventoryError('STOCKTAKE_STALE', '盘亏原批次不存在');
      cost = allocateFromSource({ quantity: BigInt(batch.remaining_quantity_base), amount: parseMoney(batch.remaining_cost_amount), allocatedQuantity: 0n, allocatedAmount: 0n }, -difference).amount;
      await changeBatch(context, batch, difference, -cost, { sourceKind: 'stocktake_loss', sourceId: stocktakeId, sourceLineId: line.id, effectSlot: 'stocktake' });
    }
    await context.client.query('INSERT INTO inventory_loss_entries(id,source_kind,source_id,source_line_id,batch_id,amount,operation_id) VALUES($1,$2,$3,$4,$5,$6,$7)', [randomUUID(), difference > 0n ? 'stocktake_gain' : 'stocktake_loss', stocktakeId, line.id, batch!.id, formatMoney(difference > 0n ? cost : -cost), context.operationId]);
  }
  await context.client.query("UPDATE stocktakes SET status='confirmed',version=version+1,operation_id=$2 WHERE id=$1", [stocktakeId, context.operationId]);
  return getInventory(context.client, 'Stocktake', stocktakeId);
}

export interface InventoryListOptions { cursor?: string; limit?: number; warehouseId?: string; productId?: string; batchId?: string; positiveOnly?: boolean; kind?: 'purchase' | 'opening'; from?: string; to?: string }
type InventoryListKind = 'Receipt' | 'Batch' | 'StockBalance' | 'StockMovement' | 'Stocktake';
export async function listInventory(sql: Sql, kind: InventoryListKind, options: InventoryListOptions = {}): Promise<SchemaValue<'ReceiptPage'> | SchemaValue<'BatchPage'> | SchemaValue<'StockBalancePage'> | SchemaValue<'StockMovementPage'> | SchemaValue<'StocktakePage'>> {
  const limit = options.limit ?? 50;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new AppError('INVALID_REQUEST', 400, '分页数量无效');
  if (options.from && options.to && new Date(options.from) >= new Date(options.to)) throw new AppError('INVALID_REQUEST', 400, '起始时间必须早于结束时间');
  const scope = JSON.stringify([kind, options.warehouseId ?? '', options.productId ?? '', options.batchId ?? '', options.kind ?? '', options.positiveOnly ?? true, options.from ?? '', options.to ?? '']);
  let after: string | undefined;
  if (options.cursor) {
    try {
      const value: unknown = JSON.parse(Buffer.from(options.cursor, 'base64url').toString());
      if (!Array.isArray(value) || value.length !== 2 || value[0] !== scope || typeof value[1] !== 'string') throw new Error();
      after = value[1];
      if (kind === 'StockBalance') { const keys = after.split(':'); if (keys.length !== 2) throw new Error(); keys.forEach(key => parseSchema('Id', key)); }
      else parseSchema('Id', after);
    } catch { throw new AppError('INVALID_REQUEST', 400, '分页游标无效或查询条件已变更'); }
  }
  const tables = { Receipt: ['receipts', 'inventory_receipt_data'], Batch: ['inventory_batches', 'inventory_batch_data'], StockBalance: ['stock_balances', 'inventory_balance_data'], StockMovement: ['stock_movements', 'inventory_movement_data'], Stocktake: ['stocktakes', 'inventory_stocktake_data'] } as const;
  const [table, view] = tables[kind]; const values: unknown[] = [];
  const bind = (value: unknown): string => { values.push(value); return `$${values.length}`; };
  const where: string[] = [];
  if (after) where.push(kind === 'StockBalance' ? `(t.product_id,t.warehouse_id)>(${bind(after.split(':')[0])}::uuid,${bind(after.split(':')[1])}::uuid)` : `t.id>${bind(after)}::uuid`);
  if (options.warehouseId) where.push(`t.warehouse_id=${bind(options.warehouseId)}`);
  if (options.productId) where.push(`t.product_id=${bind(options.productId)}`);
  if (options.batchId) where.push(`t.batch_id=${bind(options.batchId)}`);
  if (options.kind) where.push(`t.kind=${bind(options.kind)}`);
  if (kind === 'Batch' && (options.positiveOnly ?? true)) where.push('t.remaining_quantity_base>0');
  if (options.from) where.push(`t.recorded_at>=${bind(options.from)}::timestamptz`);
  if (options.to) where.push(`t.recorded_at<${bind(options.to)}::timestamptz`);
  const key = kind === 'StockBalance' ? "t.product_id::text||':'||t.warehouse_id::text" : 't.id::text';
  const join = kind === 'StockBalance' ? 'v.product_id=t.product_id AND v.warehouse_id=t.warehouse_id' : 'v.id=t.id';
  const order = kind === 'StockBalance' ? 't.product_id,t.warehouse_id' : 't.id';
  const result = await sql.query<{ cursor_key: string; data: unknown }>(`SELECT ${key} AS cursor_key,v.data FROM ${table} t JOIN ${view} v ON ${join} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order} LIMIT ${bind(limit + 1)}`, values);
  const page = result.rows.slice(0, limit); const nextCursor = result.rows.length > limit ? Buffer.from(JSON.stringify([scope, page.at(-1)!.cursor_key])).toString('base64url') : null;
  return parseSchema(`${kind}Page`, { items: page.map(row => row.data), nextCursor, asOf: new Date().toISOString() });
}
