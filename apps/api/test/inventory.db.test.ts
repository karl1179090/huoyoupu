import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { PoolClient } from 'pg';
import { createTestDatabase } from '@huoyoupu/database/testing';
import { withTransaction } from '@huoyoupu/database';
import { parseMoney } from '@huoyoupu/money';
import { AppError } from '../src/lib/errors.js';
import type { Actor, OperationContext } from '../src/lib/security.js';
import * as catalog from '../src/modules/catalog/service.js';
import { createReceipt, createStocktake, patchStocktake, confirmStocktake, getInventory } from '../src/modules/inventory/service.js';
import { issueInventory, restoreInventory, rebuildStockBalances, type IssueLine, type InventoryAllocation } from '../src/modules/inventory/stock.js';

const code = (expected: string) => (error: unknown) => error instanceof AppError && error.code === expected;
const sqlCode = (expected: string) => (error: unknown) => !!error && typeof error === 'object' && 'code' in error && error.code === expected;

async function setup() {
  const database = await createTestDatabase(); const { pool } = database;
  const actor: Actor = { id: randomUUID(), loginName: 'inventory-test-admin', role: 'admin', active: true, version: 1 };
  await pool.query('INSERT INTO users(id,login_name,normalized_login_name,password_hash,role) VALUES($1,$2,$2,$3,$4)', [actor.id, actor.loginName, 'not-a-real-credential', actor.role]);
  const operation = <T>(work: (context: OperationContext) => Promise<T>): Promise<T> => withTransaction(pool, async client => {
    const operationId = randomUUID(); await client.query('INSERT INTO business_operations(id,kind,actor_id) VALUES($1,$2,$3)', [operationId, 'inventory_fixture', actor.id]);
    return work({ client, actor, operationId });
  });
  const product = await withTransaction(pool, client => catalog.createProduct(client, { code: 'P1', name: '测试酱油', baseUnit: { name: '瓶', defaultSalePrice: '2' }, units: [{ name: '件', multiplierBase: 24, defaultSalePrice: '48' }] }));
  const otherProduct = await withTransaction(pool, client => catalog.createProduct(client, { code: 'P2', name: '测试汽水', baseUnit: { name: '瓶', defaultSalePrice: '3' } }));
  const warehouse = await withTransaction(pool, client => catalog.createWarehouse(client, { code: 'W1', name: '主仓' }));
  const otherWarehouse = await withTransaction(pool, client => catalog.createWarehouse(client, { code: 'W2', name: '分仓' }));
  const receipt = (count: number, cost = '1.000000', receivedAt = '2026-01-01T00:00:00Z', options: { warehouseId?: string; unitId?: string; productId?: string; kind?: 'purchase' | 'opening' } = {}) => operation(context => createReceipt(context, { kind: options.kind ?? 'purchase', warehouseId: options.warehouseId ?? warehouse.id, receivedAt, lines: [{ productId: options.productId ?? product.id, unitId: options.unitId ?? product.baseUnitId, quantity: count, unitCost: cost }] }));
  const issue = (count: number, options: Partial<IssueLine> = {}) => operation(context => issueInventory(context, { sourceId: randomUUID(), lines: [{ lineId: randomUUID(), productId: product.id, warehouseId: warehouse.id, quantityBase: count, allocationMode: 'auto', ...options }] }));
  const reconcile = async () => {
    const result = await pool.query(`SELECT s.product_id,s.warehouse_id,s.quantity_base::text AS summary_quantity,s.cost_amount::text AS summary_cost,
      (SELECT COALESCE(sum(b.remaining_quantity_base),0)::text FROM inventory_batches b WHERE b.product_id=s.product_id AND b.warehouse_id=s.warehouse_id) AS batch_quantity,
      (SELECT COALESCE(sum(b.remaining_cost_amount),0)::numeric(20,2)::text FROM inventory_batches b WHERE b.product_id=s.product_id AND b.warehouse_id=s.warehouse_id) AS batch_cost,
      (SELECT COALESCE(sum(m.quantity_delta_base),0)::text FROM stock_movements m WHERE m.product_id=s.product_id AND m.warehouse_id=s.warehouse_id) AS movement_quantity,
      (SELECT COALESCE(sum(m.cost_delta_amount),0)::numeric(20,2)::text FROM stock_movements m WHERE m.product_id=s.product_id AND m.warehouse_id=s.warehouse_id) AS movement_cost
      FROM stock_balances s`);
    for (const row of result.rows) {
      assert.equal(row.summary_quantity, row.batch_quantity); assert.equal(row.summary_cost, row.batch_cost);
      assert.equal(row.summary_quantity, row.movement_quantity); assert.equal(row.summary_cost, row.movement_cost);
    }
  };
  return { ...database, actor, operation, product, otherProduct, warehouse, otherWarehouse, receipt, issue, reconcile };
}

test('receipts preserve actual cost, independent source, backdated business time, and rebuildable ledgers', async () => {
  const f = await setup();
  try {
    const a = await f.receipt(3, '2.123456'); const b = await f.receipt(2, '7.000000', '2026-01-01T00:00:00Z', { kind: 'opening' });
    assert.notEqual(a.lines[0]!.batchId, b.lines[0]!.batchId); assert.equal(a.lines[0]!.unitCost, '2.123456'); assert.equal(a.lines[0]!.costAmount, '6.37');
    assert.ok(new Date(a.recordedAt).getTime() > new Date(a.receivedAt).getTime());
    const issued = await f.issue(1); const oldCost = issued[0]!.costAmount;
    const earlier = await f.receipt(1, '20', '2025-12-01T00:00:00Z');
    const next = await f.issue(1); assert.equal(next[0]!.batchId, earlier.lines[0]!.batchId);
    const old = await f.pool.query('SELECT cost_delta_amount::text FROM stock_movements WHERE source_line_id=$1 AND source_kind=$2', [issued[0]!.id, 'sale_issue']);
    assert.equal(old.rows[0].cost_delta_amount, `-${oldCost}`);
    await assert.rejects(f.receipt(1, '1', '2999-01-01T00:00:00Z'), code('INVALID_REQUEST'));
    await assert.rejects(f.operation(context => createReceipt(context, { kind: 'purchase', warehouseId: f.warehouse.id, receivedAt: '2026-01-01T00:00:00Z', lines: [{ productId: f.product.id, unitId: f.otherProduct.baseUnitId, quantity: 1, unitCost: '1' }] })), code('NOT_FOUND'));
    const batch = await getInventory(f.pool, 'Batch', a.lines[0]!.batchId);
    await assert.rejects(withTransaction(f.pool, client => client.query('UPDATE inventory_batches SET remaining_quantity_base=-1 WHERE id=$1', [batch.id])), sqlCode('23514'));
    await assert.rejects(withTransaction(f.pool, client => client.query('UPDATE stock_balances SET quantity_base=9007199254740992 WHERE product_id=$1 AND warehouse_id=$2', [f.product.id, f.warehouse.id])), sqlCode('23514'));
    await assert.rejects(withTransaction(f.pool, client => client.query(`INSERT INTO inventory_batches(id,product_id,warehouse_id,source_kind,receipt_line_id,received_at,cost_unit_id,multiplier_snapshot,input_unit_cost,initial_quantity_base,remaining_quantity_base,initial_cost_amount,remaining_cost_amount)
      SELECT $1,product_id,warehouse_id,source_kind,receipt_line_id,received_at,cost_unit_id,multiplier_snapshot,input_unit_cost,initial_quantity_base,remaining_quantity_base,initial_cost_amount,remaining_cost_amount FROM inventory_batches WHERE id=$2`, [randomUUID(), batch.id])), sqlCode('23505'));
    await assert.rejects(withTransaction(f.pool, client => client.query(`INSERT INTO stock_movements(id,operation_id,source_kind,source_id,source_line_id,batch_id,product_id,warehouse_id,quantity_delta_base,cost_delta_amount,balance_after_base,operator_id,effect_slot)
      SELECT $1,operation_id,source_kind,source_id,source_line_id,batch_id,product_id,warehouse_id,quantity_delta_base,cost_delta_amount,balance_after_base,operator_id,effect_slot FROM stock_movements WHERE batch_id=$2 LIMIT 1`, [randomUUID(), batch.id])), sqlCode('23505'));
    await assert.rejects(withTransaction(f.pool, client => client.query("UPDATE stock_movements SET source_kind='changed' WHERE batch_id=$1", [batch.id])), sqlCode('23514'));
    await f.reconcile();
    // Simulate damaged materialized summary only, then repair from independent sources.
    await f.pool.query('UPDATE stock_balances SET quantity_base=0,cost_amount=0 WHERE product_id=$1 AND warehouse_id=$2', [f.product.id, f.warehouse.id]);
    await withTransaction(f.pool, client => rebuildStockBalances(client, [{ productId: f.product.id, warehouseId: f.warehouse.id }]));
    await f.reconcile();
  } finally { await f.cleanup(); }
});

test('automatic FIFO spans batches, repeated lines share demand, and manual choice never silently expands', async () => {
  const f = await setup();
  try {
    const early = await f.receipt(3, '1', '2026-01-01T00:00:00Z'); const late = await f.receipt(7, '2', '2026-01-02T00:00:00Z');
    await assert.rejects(f.issue(5, { allocationMode: 'manual', batchSelections: [{ batchId: early.lines[0]!.batchId, quantityBase: 2 }] }), code('BATCH_SELECTION_REQUIRED'));
    await assert.rejects(f.issue(5, { allocationMode: 'manual', batchSelections: [{ batchId: early.lines[0]!.batchId, quantityBase: 5 }] }), code('BATCH_SELECTION_REQUIRED'));
    await assert.rejects(f.operation(context => issueInventory(context, { sourceId: randomUUID(), lines: [1, 2].map(() => ({ lineId: randomUUID(), productId: f.product.id, warehouseId: f.warehouse.id, quantityBase: Number.MAX_SAFE_INTEGER, allocationMode: 'auto' })) })), code('INVALID_QUANTITY'));
    const selected = await f.issue(5); assert.deepEqual(selected.map(row => [row.batchId, row.quantityBase]), [[early.lines[0]!.batchId, 3], [late.lines[0]!.batchId, 2]]);
    await assert.rejects(f.operation(context => issueInventory(context, { sourceId: randomUUID(), lines: [1, 2].map(() => ({ lineId: randomUUID(), productId: f.product.id, warehouseId: f.warehouse.id, quantityBase: 4, allocationMode: 'auto' })) })), code('INSUFFICIENT_STOCK'));
    assert.equal((await getInventory(f.pool, 'Batch', late.lines[0]!.batchId)).quantityBase, 5);
    await f.receipt(10, '1', undefined, { warehouseId: f.otherWarehouse.id });
    await assert.rejects(f.issue(6), code('INSUFFICIENT_STOCK'));
    await f.reconcile();
  } finally { await f.cleanup(); }
});

test('competing transactions never oversell and multi-key lock order completes without inversion', async () => {
  const f = await setup();
  try {
    await f.receipt(5);
    const competing = await Promise.allSettled([f.issue(4), f.issue(4)]);
    assert.equal(competing.filter(result => result.status === 'fulfilled').length, 1);
    const failed = competing.find(result => result.status === 'rejected') as PromiseRejectedResult;
    assert.ok(code('INSUFFICIENT_STOCK')(failed.reason));
    await f.receipt(10, '1', undefined, { warehouseId: f.otherWarehouse.id });
    const lines = [f.warehouse.id, f.otherWarehouse.id].map(warehouseId => ({ lineId: randomUUID(), productId: f.product.id, warehouseId, quantityBase: 1, allocationMode: 'auto' as const }));
    const two = await Promise.allSettled([f.operation(async context => { await context.client.query("SET LOCAL lock_timeout='2s'"); return issueInventory(context, { sourceId: randomUUID(), lines }); }), f.operation(async context => { await context.client.query("SET LOCAL lock_timeout='2s'"); return issueInventory(context, { sourceId: randomUUID(), lines: [...lines].reverse() }); })]);
    assert.ok(two.every(result => result.status === 'fulfilled' || code('INSUFFICIENT_STOCK')((result as PromiseRejectedResult).reason)));
    await f.reconcile();
  } finally { await f.cleanup(); }
});

test('10 yuan/24 bottles, every bottle issued and original costs restored, conserves all cents', async () => {
  const f = await setup();
  try {
    const pack = f.product.units.find(unit => unit.name === '件')!;
    const receipt = await f.receipt(1, '10', undefined, { unitId: pack.id });
    const allocations: InventoryAllocation[] = [];
    for (let i = 0; i < 24; i++) allocations.push(...await f.issue(1));
    assert.equal(allocations.reduce((sum, row) => sum + parseMoney(row.costAmount), 0n), 1000n);
    assert.equal((await getInventory(f.pool, 'Batch', receipt.lines[0]!.batchId)).costAmount, '0.00');
    for (const allocation of allocations.reverse()) await f.operation(context => restoreInventory(context, { sourceKind: 'return_restock', sourceId: randomUUID(), selections: [{ allocationId: allocation.id, quantityBase: 1, costAmount: allocation.costAmount }] }));
    const batch = await getInventory(f.pool, 'Batch', receipt.lines[0]!.batchId); assert.equal(batch.quantityBase, 24); assert.equal(batch.costAmount, '10.00');
    await assert.rejects(f.operation(context => restoreInventory(context, { sourceKind: 'return_restock', sourceId: randomUUID(), selections: [{ allocationId: allocations[0]!.id, quantityBase: 1, costAmount: '0.01' }] })), code('RELATED_RECORD_CONFLICT'));
    await f.reconcile();
  } finally { await f.cleanup(); }
});

test('out-of-order persisted return credit 0.00, release 0.01, restock 0.00 preserves source tails', async () => {
  const f = await setup();
  try {
    await f.receipt(3, '0.003333');
    const source = (await f.issue(3))[0]!; assert.equal(source.costAmount, '0.01');
    await assert.rejects(f.operation(context => restoreInventory(context, { sourceKind: 'order_void', sourceId: randomUUID(), selections: [{ allocationId: source.id, quantityBase: 3, costAmount: '0.00' }] })), code('RELATED_RECORD_CONFLICT'));
    // Business layer first persists a one-bottle credit of 0.00; physical stock is still out.
    const persistedReturnCredit = { allocationId: source.id, quantityBase: 1, costAmount: '0.00' };
    await assert.rejects(f.operation(context => restoreInventory(context, { sourceKind: 'order_revision_release', sourceId: randomUUID(), selections: [{ allocationId: source.id, quantityBase: 1, costAmount: '0.02' }] })), code('RELATED_RECORD_CONFLICT'));
    await f.operation(context => restoreInventory(context, { sourceKind: 'order_revision_release', sourceId: randomUUID(), selections: [{ allocationId: source.id, quantityBase: 1, costAmount: '0.01' }] }));
    await f.operation(context => restoreInventory(context, { sourceKind: 'return_restock', sourceId: randomUUID(), selections: [persistedReturnCredit] }));
    await f.operation(context => restoreInventory(context, { sourceKind: 'order_void', sourceId: randomUUID(), selections: [{ allocationId: source.id, quantityBase: 1, costAmount: '0.00' }] }));
    await assert.rejects(f.operation(context => restoreInventory(context, { sourceKind: 'order_void', sourceId: randomUUID(), selections: [{ allocationId: source.id, quantityBase: 1, costAmount: '0.00' }] })), code('RELATED_RECORD_CONFLICT'));
    const batch = await getInventory(f.pool, 'Batch', source.batchId); assert.equal(batch.quantityBase, 3); assert.equal(batch.costAmount, '0.01');
    await f.reconcile();
  } finally { await f.cleanup(); }
});

test('stocktake captures immutable version intent, requires gain costs, creates only difference batches', async () => {
  const f = await setup();
  try {
    const receipt = await f.receipt(5, '2'); const batchId = receipt.lines[0]!.batchId;
    let count = await f.operation(context => createStocktake(context, { warehouseId: f.warehouse.id, lines: [{ productId: f.product.id, batchId }] }));
    count = await f.operation(context => patchStocktake(context, count.id, { expectedVersion: count.version, lines: [{ id: count.lines[0]!.id, actualQuantityBase: 7 }] }));
    await assert.rejects(f.operation(context => confirmStocktake(context, count.id, count.version)), code('INVALID_REQUEST'));
    count = await f.operation(context => patchStocktake(context, count.id, { expectedVersion: count.version, lines: [{ id: count.lines[0]!.id, actualQuantityBase: 7, gainCostUnitId: f.product.baseUnitId, gainUnitCost: '3' }] }));
    const confirmed = await f.operation(context => confirmStocktake(context, count.id, count.version));
    assert.equal(confirmed.status, 'confirmed'); assert.ok(confirmed.lines[0]!.resultBatchId);
    assert.equal((await getInventory(f.pool, 'Batch', batchId)).quantityBase, 5);
    const gain = await getInventory(f.pool, 'Batch', confirmed.lines[0]!.resultBatchId!); assert.equal(gain.quantityBase, 2); assert.equal(gain.costAmount, '6.00');
    await assert.rejects(f.operation(context => confirmStocktake(context, count.id, confirmed.version)), code('ORDER_STATE_CONFLICT'));
    let loss = await f.operation(context => createStocktake(context, { warehouseId: f.warehouse.id, lines: [{ productId: f.product.id, batchId }] }));
    loss = await f.operation(context => patchStocktake(context, loss.id, { expectedVersion: loss.version, lines: [{ id: loss.lines[0]!.id, actualQuantityBase: 3 }] }));
    await f.operation(context => confirmStocktake(context, loss.id, loss.version));
    assert.equal((await getInventory(f.pool, 'Batch', batchId)).quantityBase, 3);
    const entries = await f.pool.query('SELECT source_kind,amount::text FROM inventory_loss_entries ORDER BY amount DESC'); assert.deepEqual(entries.rows.map(row => [row.source_kind, row.amount]), [['stocktake_gain', '6.00'], ['stocktake_loss', '-4.00']]);
    await f.reconcile();
  } finally { await f.cleanup(); }
});

test('stocktake rejects stale consumed batches and stale zero-stock snapshots atomically', async () => {
  const f = await setup();
  try {
    const receipt = await f.receipt(5); const batchId = receipt.lines[0]!.batchId;
    let count = await f.operation(context => createStocktake(context, { warehouseId: f.warehouse.id, lines: [{ productId: f.product.id, batchId }] }));
    count = await f.operation(context => patchStocktake(context, count.id, { expectedVersion: count.version, lines: [{ id: count.lines[0]!.id, actualQuantityBase: 4 }] }));
    await f.issue(1);
    await assert.rejects(f.operation(context => confirmStocktake(context, count.id, count.version)), code('STOCKTAKE_STALE'));
    assert.equal((await getInventory(f.pool, 'Stocktake', count.id)).status, 'draft');
    let zero = await f.operation(context => createStocktake(context, { warehouseId: f.otherWarehouse.id, lines: [{ productId: f.otherProduct.id, batchId: null }] }));
    zero = await f.operation(context => patchStocktake(context, zero.id, { expectedVersion: zero.version, lines: [{ id: zero.lines[0]!.id, actualQuantityBase: 2, gainCostUnitId: f.otherProduct.baseUnitId, gainUnitCost: '1' }] }));
    await f.receipt(1, '1', undefined, { warehouseId: f.otherWarehouse.id, productId: f.otherProduct.id, unitId: f.otherProduct.baseUnitId });
    await assert.rejects(f.operation(context => confirmStocktake(context, zero.id, zero.version)), code('STOCKTAKE_STALE'));
    await f.reconcile();
  } finally { await f.cleanup(); }
});
