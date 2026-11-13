import { bigint, check, foreignKey, numeric, pgTable, primaryKey, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { products, productUnits, warehouses } from './catalog.js';
const count = (name: string) => bigint(name, { mode: 'number' });
const money = (name: string) => numeric(name, { precision: 20, scale: 2 });
const price = (name: string) => numeric(name, { precision: 20, scale: 6 });
const time = (name: string) => timestamp(name, { withTimezone: true });
// Migration 003 also supplies source exclusivity, range checks, indexes, immutable
// movement/loss triggers, circular stocktake/batch FK, and API projection views.
export const receipts = pgTable('receipts', {
  id: uuid('id').primaryKey(), receiptNo: varchar('receipt_no', { length: 64 }).notNull().unique(), kind: text('kind').notNull(), warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
  supplierReference: varchar('supplier_reference', { length: 200 }).notNull().default(''), receivedAt: time('received_at').notNull(), recordedAt: time('recorded_at').notNull().defaultNow(),
  operatorId: uuid('operator_id').notNull(), operationId: uuid('operation_id').notNull().unique(),
});
export const receiptLines = pgTable('receipt_lines', {
  id: uuid('id').primaryKey(), receiptId: uuid('receipt_id').notNull().references(() => receipts.id), productId: uuid('product_id').notNull().references(() => products.id), unitId: uuid('unit_id').notNull(),
  quantity: count('quantity').notNull(), multiplierSnapshot: count('multiplier_snapshot').notNull(), quantityBase: count('quantity_base').notNull(), inputUnitCost: price('input_unit_cost').notNull(), costAmount: money('cost_amount').notNull(),
}, table => [foreignKey({ columns: [table.unitId, table.productId], foreignColumns: [productUnits.id, productUnits.productId] })]);
export const stockBalances = pgTable('stock_balances', {
  productId: uuid('product_id').notNull().references(() => products.id), warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id), quantityBase: count('quantity_base').notNull().default(0),
  costAmount: money('cost_amount').notNull().default('0.00'), version: count('version').notNull().default(1),
}, table => [primaryKey({ columns: [table.productId, table.warehouseId] })]);
export const stocktakes = pgTable('stocktakes', {
  id: uuid('id').primaryKey(), stocktakeNo: varchar('stocktake_no', { length: 64 }).notNull().unique(), warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
  countedAt: time('counted_at').notNull(), status: text('status').notNull().default('draft'), version: count('version').notNull().default(1), operatorId: uuid('operator_id').notNull(), operationId: uuid('operation_id').notNull(), createdAt: time('created_at').notNull().defaultNow(),
});
export const stocktakeLines = pgTable('stocktake_lines', {
  id: uuid('id').primaryKey(), stocktakeId: uuid('stocktake_id').notNull().references(() => stocktakes.id), productId: uuid('product_id').notNull().references(() => products.id), batchId: uuid('batch_id'),
  snapshotQuantityBase: count('snapshot_quantity_base').notNull(), snapshotBatchVersion: count('snapshot_batch_version'), snapshotStockVersion: count('snapshot_stock_version').notNull(),
  actualQuantityBase: count('actual_quantity_base'), differenceBase: count('difference_base').generatedAlwaysAs(sql`actual_quantity_base-snapshot_quantity_base`), gainCostUnitId: uuid('gain_cost_unit_id'), gainUnitCost: price('gain_unit_cost'),
}, table => [foreignKey({ columns: [table.gainCostUnitId, table.productId], foreignColumns: [productUnits.id, productUnits.productId] }), unique().on(table.stocktakeId, table.productId, table.batchId).nullsNotDistinct()]);
export const inventoryBatches = pgTable('inventory_batches', {
  id: uuid('id').primaryKey(), productId: uuid('product_id').notNull().references(() => products.id), warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
  sourceKind: text('source_kind').notNull(), receiptLineId: uuid('receipt_line_id').unique().references(() => receiptLines.id), stocktakeLineId: uuid('stocktake_line_id').unique().references(() => stocktakeLines.id),
  receivedAt: time('received_at').notNull(), recordedAt: time('recorded_at').notNull().defaultNow(), costUnitId: uuid('cost_unit_id').notNull(), multiplierSnapshot: count('multiplier_snapshot').notNull(), inputUnitCost: price('input_unit_cost').notNull(),
  initialQuantityBase: count('initial_quantity_base').notNull(), remainingQuantityBase: count('remaining_quantity_base').notNull(), initialCostAmount: money('initial_cost_amount').notNull(), remainingCostAmount: money('remaining_cost_amount').notNull(), version: count('version').notNull().default(1),
}, table => [unique().on(table.id, table.productId, table.warehouseId), foreignKey({ columns: [table.costUnitId, table.productId], foreignColumns: [productUnits.id, productUnits.productId] }), check('inventory_batch_remaining_nonnegative', sql`${table.remainingQuantityBase}>=0 AND ${table.remainingCostAmount}>=0`)]);
export const stockMovements = pgTable('stock_movements', {
  id: uuid('id').primaryKey(), operationId: uuid('operation_id').notNull(), sourceKind: text('source_kind').notNull(), sourceId: uuid('source_id').notNull(), sourceLineId: uuid('source_line_id').notNull(),
  batchId: uuid('batch_id').notNull(), productId: uuid('product_id').notNull(), warehouseId: uuid('warehouse_id').notNull(), quantityDeltaBase: count('quantity_delta_base').notNull(), costDeltaAmount: money('cost_delta_amount').notNull(), balanceAfterBase: count('balance_after_base').notNull(),
  recordedAt: time('recorded_at').notNull().defaultNow(), operatorId: uuid('operator_id').notNull(), effectSlot: text('effect_slot').notNull(),
}, table => [foreignKey({ columns: [table.batchId, table.productId, table.warehouseId], foreignColumns: [inventoryBatches.id, inventoryBatches.productId, inventoryBatches.warehouseId] }), unique().on(table.sourceKind, table.sourceId, table.sourceLineId, table.effectSlot)]);
export const inventoryLossEntries = pgTable('inventory_loss_entries', {
  id: uuid('id').primaryKey(), sourceKind: text('source_kind').notNull(), sourceId: uuid('source_id').notNull(), sourceLineId: uuid('source_line_id').notNull(), batchId: uuid('batch_id').references(() => inventoryBatches.id), amount: money('amount').notNull(),
  effectiveAt: time('effective_at').notNull().defaultNow(), recordedAt: time('recorded_at').notNull().defaultNow(), operationId: uuid('operation_id').notNull(), reversesId: uuid('reverses_id').unique(),
}, table => [unique().on(table.sourceKind, table.sourceId, table.sourceLineId)]);
