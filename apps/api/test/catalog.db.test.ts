import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createTestDatabase } from '@huoyoupu/database/testing';
import { withTransaction } from '@huoyoupu/database';
import { parseSchema } from '@huoyoupu/contracts';
import { AppError } from '../src/lib/errors.js';
import * as catalog from '../src/modules/catalog/service.js';

const isCode = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const isSql = (code: string) => (error: unknown) => !!error && typeof error === 'object' && 'code' in error && error.code === code;

test('catalog uses real PostgreSQL constraints, atomic services, snapshots, and reference discovery', async t => {
  const database = await createTestDatabase();
  const { pool } = database;
  try {
    const product = await withTransaction(pool, client => catalog.createProduct(client, parseSchema('ProductCreate', {
      code: 'SOY-001', name: '500ml酱油', baseUnit: { name: '瓶', defaultSalePrice: '2.50', defaultReceiptCost: '1.00' },
      units: [{ name: '件', multiplierBase: 24, defaultSalePrice: '60.00' }],
      barcodes: [{ value: '0012345678901', unitName: '瓶' }],
    })));
    const base = product.units.find(unit => unit.id === product.baseUnitId)!;
    const pack = product.units.find(unit => unit.name === '件')!;
    const customer = await withTransaction(pool, client => catalog.createCustomer(client, { code: 'C1', name: '测试客户' }));
    const otherCustomer = await withTransaction(pool, client => catalog.createCustomer(client, { code: 'C2', name: '测试客户乙' }));
    await t.test('search preserves mnemonic, case, partial words, leading-zero barcodes, and collisions', async () => {
      assert.equal(product.mnemonicCode, '500mljy');
      for (const q of ['500MLJY', 'jy', '0012345678901', 'SOY-001', '酱油']) {
        const page = await catalog.listCatalog(pool, 'Product', { q }); assert.equal(page.items.length, 1, q);
      }
      const collision = await withTransaction(pool, client => catalog.createProduct(client, { code: 'SOY-002', name: '500ml酱油', baseUnit: { name: '瓶', defaultSalePrice: '3' } }));
      assert.equal(collision.mnemonicCode, product.mnemonicCode);
      assert.equal((await catalog.listCatalog(pool, 'Product', { q: '500mljy' })).items.length, 2);
      await assert.rejects(withTransaction(pool, client => catalog.createProduct(client, { code: 'soy-001', name: '重复', baseUnit: { name: '瓶', defaultSalePrice: '3' } })), isSql('23505'));
      assert.equal((await catalog.listCatalog(pool, 'Product', { q: '%' })).items.length, 0);
    });
    await t.test('renaming clears old manual mnemonic unless an explicit replacement accompanies it', async () => {
      let current = await withTransaction(pool, client => catalog.patchProduct(client, product.id, { expectedVersion: product.version, mnemonicCodeOverride: 'CUSTOM500' }));
      assert.equal(current.mnemonicCode, 'custom500');
      current = await withTransaction(pool, client => catalog.patchProduct(client, product.id, { expectedVersion: current.version, name: '250ML酱油' }));
      assert.equal(current.mnemonicCode, '250mljy'); assert.equal(current.mnemonicCodeOverride, null);
      current = await withTransaction(pool, client => catalog.patchProduct(client, product.id, { expectedVersion: current.version, name: '300ml酱油', mnemonicCodeOverride: 'NEW300' }));
      assert.equal(current.mnemonicCode, 'new300');
      await assert.rejects(withTransaction(pool, client => catalog.patchProduct(client, product.id, { expectedVersion: product.version, brand: '过期' })), isCode('VERSION_CONFLICT'));
      await assert.rejects(withTransaction(pool, client => catalog.patchProduct(client, product.id, { expectedVersion: current.version, name: current.name })), isCode('INVALID_REQUEST'));
    });
    await t.test('barcodes enforce global uniqueness and unit ownership without partial deletion', async () => {
      const foreignProduct = await withTransaction(pool, client => catalog.createProduct(client, { code: 'P3', name: '雪碧', baseUnit: { name: '瓶', defaultSalePrice: '0' } }));
      let current = await catalog.getCatalog(pool, 'Product', product.id);
      await assert.rejects(withTransaction(pool, client => catalog.replaceBarcodes(client, product.id, { expectedVersion: current.version, barcodes: [{ value: 'other', unitId: foreignProduct.baseUnitId }] })), isCode('NOT_FOUND'));
      assert.equal((await catalog.getCatalog(pool, 'Product', product.id)).barcodes[0]!.value, '0012345678901');
      await assert.rejects(withTransaction(pool, client => catalog.replaceBarcodes(client, foreignProduct.id, { expectedVersion: foreignProduct.version, barcodes: [{ value: '0012345678901', unitId: foreignProduct.baseUnitId }] })), isSql('23505'));
      current = await catalog.getCatalog(pool, 'Product', product.id);
      assert.equal(current.barcodes.length, 1);
    });
    await t.test('base multiplier and cross-product base-unit ownership are database constraints', async () => {
      await assert.rejects(withTransaction(pool, client => client.query('UPDATE product_units SET multiplier_base=2 WHERE id=$1', [base.id])), isSql('23514'));
      await assert.rejects(withTransaction(pool, client => client.query('UPDATE products SET base_unit_id=$1 WHERE id=$2', [randomUUID(), product.id])), isSql('23503'));
      await assert.rejects(withTransaction(pool, client => client.query('UPDATE product_units SET multiplier_base=9007199254740992 WHERE id=$1', [pack.id])), isSql('23514'));
      await assert.rejects(withTransaction(pool, client => catalog.patchUnit(client, product.id, base.id, { expectedVersion: base.version, multiplierBase: 12 })), isCode('UNIT_REFERENCED'));
      let updated = await withTransaction(pool, client => catalog.patchUnit(client, product.id, pack.id, { expectedVersion: pack.version, multiplierBase: 12 }));
      assert.equal(updated.multiplierBase, 12);
      await pool.query('CREATE TABLE catalog_test_transaction_lines(id uuid PRIMARY KEY, unit_id uuid NOT NULL REFERENCES product_units(id))');
      await pool.query('INSERT INTO catalog_test_transaction_lines(id,unit_id) VALUES($1,$2)', [randomUUID(), pack.id]);
      await assert.rejects(withTransaction(pool, client => catalog.patchUnit(client, product.id, pack.id, { expectedVersion: updated.version, multiplierBase: 24 })), isCode('UNIT_REFERENCED'));
      updated = await withTransaction(pool, client => catalog.patchUnit(client, product.id, pack.id, { expectedVersion: updated.version, defaultSalePrice: '55.123456' }));
      assert.equal(updated.defaultSalePrice, '55.123456');
    });
    await t.test('customer address defaults serialize and snapshots never follow later edits', async () => {
      const a = await withTransaction(pool, client => catalog.createAddress(client, customer.id, { contactName: '张三', address: '旧地址', isDefault: true }));
      const b = await withTransaction(pool, client => catalog.createAddress(client, customer.id, { contactName: '李四', address: '地址乙', isDefault: true }));
      const customerNow = await catalog.getCatalog(pool, 'Customer', customer.id);
      assert.equal(customerNow.addresses.filter(address => address.isDefault).length, 1);
      assert.equal(customerNow.addresses.find(address => address.id === a.id)!.isDefault, false);
      const snapshot = await catalog.resolveDeliverySnapshot(pool, customer.id);
      await withTransaction(pool, client => catalog.patchAddress(client, customer.id, b.id, { expectedVersion: b.version, address: '新地址' }));
      assert.equal(snapshot.address, '地址乙');
      assert.equal((await catalog.resolveDeliverySnapshot(pool, customer.id)).address, '新地址');
      await assert.rejects(catalog.resolveDeliverySnapshot(pool, otherCustomer.id, b.id), isCode('NOT_FOUND'));
      await assert.rejects(withTransaction(pool, client => catalog.patchAddress(client, otherCustomer.id, b.id, { expectedVersion: b.version + 1, address: '越权地址' })), isCode('NOT_FOUND'));
      const latest = await catalog.getCatalog(pool, 'Address', b.id);
      await withTransaction(pool, client => catalog.patchAddress(client, customer.id, b.id, { expectedVersion: latest.version, active: false }));
      await assert.rejects(catalog.resolveDeliverySnapshot(pool, customer.id, b.id), isCode('NOT_FOUND'));
      assert.equal((await catalog.getCatalog(pool, 'Address', b.id)).isDefault, false);
    });
    await t.test('customer prices enforce composite ownership and first-upsert version zero', async () => {
      const price = await withTransaction(pool, client => catalog.upsertPriceRule(client, customer.id, product.id, base.id, { expectedVersion: 0, unitPrice: '1.25' }));
      assert.equal(price.version, 1); assert.equal(price.unitPrice, '1.250000');
      await assert.rejects(withTransaction(pool, client => catalog.upsertPriceRule(client, customer.id, product.id, base.id, { expectedVersion: 0, unitPrice: '1.50' })), isCode('VERSION_CONFLICT'));
      await assert.rejects(withTransaction(pool, client => catalog.upsertPriceRule(client, customer.id, product.id, randomUUID(), { expectedVersion: 0, unitPrice: '1.50' })), isCode('NOT_FOUND'));
      const page = await catalog.listPriceRules(pool, customer.id); assert.equal(page.items.length, 1);
      await withTransaction(pool, client => catalog.deletePriceRule(client, customer.id, product.id, base.id, 1));
      assert.equal((await catalog.listPriceRules(pool, customer.id)).items.length, 0);
    });
    await t.test('warehouses and keyset pages preserve disabled records and reject wrong-scope cursors', async () => {
      const warehouse = await withTransaction(pool, client => catalog.createWarehouse(client, { code: 'W1', name: '主仓' }));
      const disabled = await withTransaction(pool, client => catalog.patchWarehouse(client, warehouse.id, { expectedVersion: warehouse.version, active: false }));
      assert.equal(disabled.active, false);
      assert.equal((await catalog.listCatalog(pool, 'Warehouse')).items.length, 1);
      const first = await catalog.listCatalog(pool, 'Product', { limit: 1 }); assert.ok(first.nextCursor);
      const second = await catalog.listCatalog(pool, 'Product', { limit: 1, cursor: first.nextCursor });
      assert.notEqual(first.items[0]!.id, second.items[0]!.id);
      await assert.rejects(catalog.listCatalog(pool, 'Product', { cursor: first.nextCursor, q: 'changed' }), isCode('INVALID_REQUEST'));
      const current = await catalog.getCatalog(pool, 'Product', product.id);
      await withTransaction(pool, client => catalog.patchProduct(client, product.id, { expectedVersion: current.version, active: false }));
      assert.ok(!(await catalog.listCatalog(pool, 'Product')).items.some(item => item.id === product.id));
      assert.ok((await catalog.listCatalog(pool, 'Product', { includeInactive: true })).items.some(item => item.id === product.id));
      assert.equal((await catalog.getCatalog(pool, 'Product', product.id)).active, false);
    });
  } finally { await database.cleanup(); }
});
