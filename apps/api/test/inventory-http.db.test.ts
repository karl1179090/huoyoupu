import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { parseSchema } from '@huoyoupu/contracts';
import { withTransaction } from '@huoyoupu/database';
import { apiFixture, password, writeHeaders } from './helpers.js';
import { issueInventory } from '../src/modules/inventory/stock.js';

test('inventory HTTP validates real roles, exact contracts, idempotency, atomic stocktakes, and audits', async t => {
  const f = await apiFixture();
  try {
    const admin = await f.login();
    const productResponse = await f.app.inject({ method: 'POST', url: '/api/v1/products', headers: writeHeaders(admin), payload: { code: 'INV-HTTP', name: '库存测试', baseUnit: { name: '瓶', defaultSalePrice: '2' }, units: [{ name: '件', multiplierBase: 24, defaultSalePrice: '48' }] } });
    assert.equal(productResponse.statusCode, 201, productResponse.body); const product = parseSchema('Product', productResponse.json());
    const warehouseResponse = await f.app.inject({ method: 'POST', url: '/api/v1/warehouses', headers: writeHeaders(admin), payload: { code: 'INV-W1', name: '测试仓库' } });
    assert.equal(warehouseResponse.statusCode, 201); const warehouse = parseSchema('Warehouse', warehouseResponse.json());
    const receiptInput = { kind: 'purchase', warehouseId: warehouse.id, receivedAt: '2026-01-01T00:00:00+08:00', lines: [{ productId: product.id, unitId: product.baseUnitId, quantity: 5, unitCost: '1.123456' }] };
    const key = randomUUID();
    const receiptResponse = await f.app.inject({ method: 'POST', url: '/api/v1/receipts', headers: writeHeaders(admin, key), payload: receiptInput });
    assert.equal(receiptResponse.statusCode, 201, receiptResponse.body); const receipt = parseSchema('Receipt', receiptResponse.json());
    const batchId = receipt.lines[0]!.batchId;
    await t.test('receipt replay keeps one batch/movement and preserves actual versus registration time', async () => {
      const replay = await f.app.inject({ method: 'POST', url: '/api/v1/receipts', headers: writeHeaders(admin, key), payload: receiptInput });
      assert.equal(replay.statusCode, 201); assert.equal(replay.headers['idempotency-replayed'], 'true'); assert.deepEqual(replay.json(), receipt);
      assert.equal((await f.pool.query('SELECT count(*) FROM receipts')).rows[0].count, '1');
      assert.equal((await f.pool.query('SELECT count(*) FROM inventory_batches')).rows[0].count, '1');
      assert.equal(receipt.lines[0]!.costAmount, '5.62'); assert.ok(new Date(receipt.recordedAt) > new Date(receipt.receivedAt));
      const get = await f.app.inject({ url: `/api/v1/receipts/${receipt.id}`, headers: { cookie: admin.cookie } }); assert.equal(get.statusCode, 200); assert.deepEqual(parseSchema('Receipt', get.json()), receipt);
    });
    await t.test('invalid decimal quantities, unknown fields and future times are cached failures with no partial effects', async () => {
      for (const payload of [{ ...receiptInput, lines: [{ ...receiptInput.lines[0], quantity: 1.5 }] }, { ...receiptInput, internalCost: '1.00' }, { ...receiptInput, receivedAt: '2999-01-01T00:00:00Z' }]) {
        const key = randomUUID(); const request = { method: 'POST' as const, url: '/api/v1/receipts', headers: writeHeaders(admin, key), payload };
        const response = await f.app.inject(request); assert.equal(response.statusCode, 400, response.body); parseSchema('ApiError', response.json());
        const replay = await f.app.inject(request); assert.equal(replay.statusCode, response.statusCode); assert.equal(replay.headers['idempotency-replayed'], 'true'); assert.deepEqual(replay.json(), response.json());
      }
      assert.equal((await f.pool.query('SELECT count(*) FROM receipts')).rows[0].count, '1');
      assert.equal((await f.pool.query('SELECT quantity_base FROM stock_balances')).rows[0].quantity_base, '5');
    });
    await t.test('lists honor filters, strict query keys, boolean decoding and cursor bounds', async () => {
      const headers = { cookie: admin.cookie };
      for (const [url, schema] of [[`/api/v1/receipts?warehouseId=${warehouse.id}&kind=purchase&limit=1`, 'ReceiptPage'], [`/api/v1/inventory/batches?productId=${product.id}&positiveOnly=false`, 'BatchPage'], [`/api/v1/inventory/balances?warehouseId=${warehouse.id}`, 'StockBalancePage'], [`/api/v1/inventory/movements?batchId=${batchId}&from=2026-01-01T00%3A00%3A00Z&to=2999-01-01T00%3A00%3A00Z`, 'StockMovementPage']] as const) {
        const result = await f.app.inject({ url, headers }); assert.equal(result.statusCode, 200, result.body); assert.equal(parseSchema(schema, result.json()).items.length, 1);
      }
      assert.equal((await f.app.inject({ url: '/api/v1/inventory/batches?sql=select', headers })).statusCode, 400);
      assert.equal((await f.app.inject({ url: '/api/v1/inventory/balances?limit=201', headers })).statusCode, 400);
      assert.equal((await f.app.inject({ url: '/api/v1/inventory/movements?from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z', headers })).statusCode, 400);
    });
    await t.test('stocktake confirm replays one loss and retains immutable receipt cost', async () => {
      const created = await f.app.inject({ method: 'POST', url: '/api/v1/stocktakes', headers: writeHeaders(admin), payload: { warehouseId: warehouse.id, lines: [{ productId: product.id, batchId }] } });
      assert.equal(created.statusCode, 201, created.body); let count = parseSchema('Stocktake', created.json());
      const patched = await f.app.inject({ method: 'PATCH', url: `/api/v1/stocktakes/${count.id}`, headers: writeHeaders(admin), payload: { expectedVersion: count.version, lines: [{ id: count.lines[0]!.id, actualQuantityBase: 4 }] } });
      assert.equal(patched.statusCode, 200, patched.body); count = parseSchema('Stocktake', patched.json());
      const request = { method: 'POST' as const, url: `/api/v1/stocktakes/${count.id}/confirm`, headers: writeHeaders(admin), payload: { expectedVersion: count.version } };
      const confirmed = await f.app.inject(request); assert.equal(confirmed.statusCode, 200, confirmed.body); assert.equal(parseSchema('Stocktake', confirmed.json()).status, 'confirmed');
      const replay = await f.app.inject(request); assert.equal(replay.statusCode, 200); assert.equal(replay.headers['idempotency-replayed'], 'true');
      assert.equal((await f.pool.query('SELECT count(*) FROM inventory_loss_entries')).rows[0].count, '1');
      assert.equal((await f.pool.query('SELECT quantity_base FROM stock_balances')).rows[0].quantity_base, '4');
      const original = await f.app.inject({ url: `/api/v1/receipts/${receipt.id}`, headers: { cookie: admin.cookie } }); assert.deepEqual(original.json(), receipt);
    });
    await t.test('stock changes make the previous batch snapshot fail atomically', async () => {
      const created = await f.app.inject({ method: 'POST', url: '/api/v1/stocktakes', headers: writeHeaders(admin), payload: { warehouseId: warehouse.id, lines: [{ productId: product.id, batchId }] } });
      let count = parseSchema('Stocktake', created.json());
      const patched = await f.app.inject({ method: 'PATCH', url: `/api/v1/stocktakes/${count.id}`, headers: writeHeaders(admin), payload: { expectedVersion: count.version, lines: [{ id: count.lines[0]!.id, actualQuantityBase: 3 }] } });
      count = parseSchema('Stocktake', patched.json());
      await withTransaction(f.pool, async client => {
        const operationId = randomUUID(); await client.query('INSERT INTO business_operations(id,kind,actor_id) VALUES($1,$2,$3)', [operationId, 'http-fixture-issue', admin.user.id]);
        await issueInventory({ client, actor: admin.user, operationId }, { sourceId: randomUUID(), lines: [{ lineId: randomUUID(), productId: product.id, warehouseId: warehouse.id, quantityBase: 1, allocationMode: 'manual', batchSelections: [{ batchId, quantityBase: 1 }] }] });
      });
      const result = await f.app.inject({ method: 'POST', url: `/api/v1/stocktakes/${count.id}/confirm`, headers: writeHeaders(admin), payload: { expectedVersion: count.version } });
      assert.equal(result.statusCode, 409, result.body); assert.equal(result.json().code, 'STOCKTAKE_STALE');
      assert.equal((await f.pool.query('SELECT status FROM stocktakes WHERE id=$1', [count.id])).rows[0].status, 'draft');
      assert.equal((await f.pool.query('SELECT count(*) FROM inventory_loss_entries')).rows[0].count, '1');
    });
    await t.test('employee and anonymous inventory requests reject before validation; entity audits are attached', async () => {
      const employeeResponse = await f.app.inject({ method: 'POST', url: '/api/v1/users', headers: writeHeaders(admin), payload: { loginName: 'inventory-reader', password, role: 'employee' } }); assert.equal(employeeResponse.statusCode, 201);
      const employee = await f.login('inventory-reader');
      const denied = await f.app.inject({ method: 'POST', url: '/api/v1/receipts', headers: writeHeaders(employee), payload: {} }); assert.equal(denied.statusCode, 403); assert.ok(!/cost|profit|input_unit_cost/i.test(denied.body));
      assert.equal((await f.app.inject({ url: '/api/v1/inventory/batches', headers: { cookie: employee.cookie } })).statusCode, 403);
      assert.equal((await f.app.inject({ method: 'POST', url: '/api/v1/stocktakes', payload: {} })).statusCode, 401);
      const audit = await f.pool.query("SELECT entity_type,old_version,new_version FROM audit_events WHERE entity_type IN ('receipt','stocktake')");
      assert.ok(audit.rows.some(row => row.entity_type === 'receipt')); assert.ok(audit.rows.some(row => Number(row.new_version) > Number(row.old_version) && Number(row.old_version) > 0));
    });
  } finally { await f.cleanup(); }
});
