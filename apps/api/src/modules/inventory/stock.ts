import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { allocateFromSource, formatMoney, parseMoney, quantity, sumQuantities } from '@huoyoupu/money';
import { AppError } from '../../lib/errors.js';
import type { OperationContext } from '../../lib/security.js';

export interface StockKey { productId: string; warehouseId: string }
export interface BatchRow {
  id: string; product_id: string; warehouse_id: string; remaining_quantity_base: string; remaining_cost_amount: string;
  input_unit_cost: string; multiplier_snapshot: string; version: string;
}
export const stockKey = ({ productId, warehouseId }: StockKey): string => `${productId.toLowerCase()}:${warehouseId.toLowerCase()}`;
export function inventoryError(code: string, message: string, details?: Record<string, unknown>): never { throw new AppError(code, 409, message, details); }
export function safeNumber(value: bigint): number { quantity(value < 0n ? -value : value, true); return Number(value); }

/** Lock ALL relevant anchors before locking ANY batch; callers must pass the full operation key set. */
export async function lockStockBalances(client: PoolClient, keys: readonly StockKey[]): Promise<void> {
  const ordered = [...new Map(keys.map(key => [stockKey(key), { productId: key.productId.toLowerCase(), warehouseId: key.warehouseId.toLowerCase() }])).values()].sort((a, b) => stockKey(a).localeCompare(stockKey(b), 'en'));
  for (const key of ordered) {
    await client.query('INSERT INTO stock_balances(product_id,warehouse_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [key.productId, key.warehouseId]);
    await client.query('SELECT product_id FROM stock_balances WHERE product_id=$1 AND warehouse_id=$2 FOR UPDATE', [key.productId, key.warehouseId]);
  }
}
export async function lockBatches(client: PoolClient, keys: readonly StockKey[]): Promise<{ rows: BatchRow[]; fifo: Map<string, number> }> {
  const products = keys.map(key => key.productId); const warehouses = keys.map(key => key.warehouseId);
  const condition = '(b.product_id,b.warehouse_id) IN (SELECT * FROM unnest($1::uuid[],$2::uuid[]))';
  const result = await client.query<BatchRow>(`SELECT b.* FROM inventory_batches b WHERE ${condition} ORDER BY b.id FOR UPDATE`, [products, warehouses]);
  // Let PostgreSQL compare full timestamp precision; JS Date would truncate microseconds.
  const fifo = await client.query<{ id: string }>(`SELECT b.id FROM inventory_batches b WHERE ${condition} ORDER BY b.received_at,b.recorded_at,b.id`, [products, warehouses]);
  return { rows: result.rows, fifo: new Map(fifo.rows.map((row, index) => [row.id, index])) };
}
export async function recordMovement(context: OperationContext, input: { batch: BatchRow; quantityDelta: bigint; costDelta: bigint; sourceKind: string; sourceId: string; sourceLineId: string; effectSlot: string }): Promise<void> {
  const { client } = context; const { batch } = input;
  const balance = await client.query<{ quantity_base: string }>(`UPDATE stock_balances SET quantity_base=quantity_base+$3,cost_amount=cost_amount+$4,version=version+1 WHERE product_id=$1 AND warehouse_id=$2 RETURNING quantity_base`, [batch.product_id, batch.warehouse_id, input.quantityDelta.toString(), formatMoney(input.costDelta)]);
  await client.query('INSERT INTO stock_movements(id,operation_id,source_kind,source_id,source_line_id,batch_id,product_id,warehouse_id,quantity_delta_base,cost_delta_amount,balance_after_base,operator_id,effect_slot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)', [randomUUID(), context.operationId, input.sourceKind, input.sourceId, input.sourceLineId, batch.id, batch.product_id, batch.warehouse_id, input.quantityDelta.toString(), formatMoney(input.costDelta), balance.rows[0]!.quantity_base, context.actor.id, input.effectSlot]);
}
export async function changeBatch(context: OperationContext, batch: BatchRow, quantityDelta: bigint, costDelta: bigint, source: { sourceKind: string; sourceId: string; sourceLineId: string; effectSlot: string }): Promise<void> {
  await context.client.query('UPDATE inventory_batches SET remaining_quantity_base=remaining_quantity_base+$2,remaining_cost_amount=remaining_cost_amount+$3,version=version+1 WHERE id=$1', [batch.id, quantityDelta.toString(), formatMoney(costDelta)]);
  batch.remaining_quantity_base = (BigInt(batch.remaining_quantity_base) + quantityDelta).toString();
  batch.remaining_cost_amount = formatMoney(parseMoney(batch.remaining_cost_amount) + costDelta);
  batch.version = (BigInt(batch.version) + 1n).toString();
  await recordMovement(context, { batch, quantityDelta, costDelta, ...source });
}
export interface IssueLine extends StockKey {
  lineId: string; quantityBase: number; allocationMode: 'auto' | 'manual'; batchSelections?: { batchId: string; quantityBase: number }[];
}
export interface InventoryAllocation extends StockKey {
  id: string; lineId: string; batchId: string; quantityBase: number; costAmount: string; inputUnitCost: string; multiplierBase: number; issueSequence: number;
}

/** Returns persistent-source identifiers for the caller's sale_allocations rows; no independent transaction. */
async function issueInventoryUnchecked(context: OperationContext, input: { sourceId: string; lines: readonly IssueLine[] }): Promise<InventoryAllocation[]> {
  if (!input.lines.length) throw new AppError('INVALID_REQUEST', 400, '库存出库明细不能为空');
  const demand = new Map<string, bigint>();
  if (new Set(input.lines.map(line => line.lineId.toLowerCase())).size !== input.lines.length) inventoryError('RELATED_RECORD_CONFLICT', '重复的逻辑行标识');
  for (const line of input.lines) demand.set(stockKey(line), sumQuantities([demand.get(stockKey(line)) ?? 0n, quantity(line.quantityBase)]));
  const keys = [...new Map(input.lines.map(line => [stockKey(line), line])).values()];
  const enabled = await context.client.query<{ active: boolean }>('SELECT p.active AND w.active AS active FROM unnest($1::uuid[],$2::uuid[]) k(product_id,warehouse_id) JOIN products p ON p.id=k.product_id JOIN warehouses w ON w.id=k.warehouse_id', [keys.map(key => key.productId), keys.map(key => key.warehouseId)]);
  if (enabled.rows.length !== keys.length || enabled.rows.some(row => !row.active)) throw new AppError('RELATED_RECORD_CONFLICT', 409, '商品或仓库不存在或已停用');
  const sequenceResult = await context.client.query<{ count: string }>("SELECT count(*) AS count FROM stock_movements WHERE source_kind='sale_issue' AND source_id=$1", [input.sourceId]);
  const sequenceStart = safeNumber(BigInt(sequenceResult.rows[0]!.count));
  await lockStockBalances(context.client, input.lines);
  const locked = await lockBatches(context.client, input.lines);
  const available = new Map<string, bigint>();
  for (const batch of locked.rows) { const key = stockKey({ productId: batch.product_id, warehouseId: batch.warehouse_id }); available.set(key, sumQuantities([available.get(key) ?? 0n, BigInt(batch.remaining_quantity_base)])); }
  const shortages = [...demand].filter(([key, amount]) => (available.get(key) ?? 0n) < amount).map(([key, amount]) => {
    const [productId, warehouseId] = key.split(':'); return { productId, warehouseId, requiredQuantityBase: safeNumber(amount), availableQuantityBase: safeNumber(available.get(key) ?? 0n), selectedBatchId: null };
  });
  if (shortages.length) inventoryError('INSUFFICIENT_STOCK', '所选仓库库存不足', { shortages });
  const result: InventoryAllocation[] = [];
  for (const line of input.lines) {
    if (line.allocationMode !== 'auto' && line.allocationMode !== 'manual') inventoryError('BATCH_SELECTION_REQUIRED', '请选择分配方式');
    const eligible = locked.rows.filter(batch => stockKey({ productId: batch.product_id, warehouseId: batch.warehouse_id }) === stockKey(line));
    let selected: { batch: BatchRow; amount: bigint }[];
    if (line.allocationMode === 'manual') {
      const choices = line.batchSelections ?? [];
      if (new Set(choices.map(choice => choice.batchId.toLowerCase())).size !== choices.length || sumQuantities(choices.map(choice => choice.quantityBase)) !== quantity(line.quantityBase)) inventoryError('BATCH_SELECTION_REQUIRED', '手选批次必须完整覆盖需求且不得重复');
      selected = choices.map(choice => {
        const batch = eligible.find(batch => batch.id === choice.batchId.toLowerCase());
        if (!batch || BigInt(batch.remaining_quantity_base) < quantity(choice.quantityBase)) inventoryError('BATCH_SELECTION_REQUIRED', '手选批次不足或不属于该商品仓库');
        return { batch, amount: quantity(choice.quantityBase) };
      });
    } else {
      if (line.batchSelections?.length) inventoryError('BATCH_SELECTION_REQUIRED', '自动模式不能附带手选批次');
      let remaining = quantity(line.quantityBase); selected = [];
      for (const batch of eligible.sort((a, b) => locked.fifo.get(a.id)! - locked.fifo.get(b.id)!)) {
        if (!remaining) break;
        const amount = BigInt(batch.remaining_quantity_base) < remaining ? BigInt(batch.remaining_quantity_base) : remaining;
        if (amount > 0n) { selected.push({ batch, amount }); remaining -= amount; }
      }
    }
    for (const { batch, amount } of selected) {
      const allocated = allocateFromSource({ quantity: BigInt(batch.remaining_quantity_base), amount: parseMoney(batch.remaining_cost_amount), allocatedQuantity: 0n, allocatedAmount: 0n }, amount);
      const id = randomUUID();
      await changeBatch(context, batch, -amount, -allocated.amount, { sourceKind: 'sale_issue', sourceId: input.sourceId, sourceLineId: id, effectSlot: 'issue' });
      result.push({ id, lineId: line.lineId, productId: batch.product_id, warehouseId: batch.warehouse_id, batchId: batch.id, quantityBase: safeNumber(amount), costAmount: formatMoney(allocated.amount), inputUnitCost: batch.input_unit_cost, multiplierBase: Number(batch.multiplier_snapshot), issueSequence: safeNumber(BigInt(sequenceStart) + BigInt(result.length) + 1n) });
    }
  }
  return result;
}

/** Explicit costAmount must come from a persisted release/return source, never current prices.
 * The business caller proves that linkage; this layer enforces original quantity/cost caps
 * and final reconciliation. Physical return order need not equal credit creation order. */
export interface RestoreSelection { allocationId: string; quantityBase: number; costAmount?: string }
export interface RestoredAllocation { allocationId: string; batchId: string; quantityBase: number; costAmount: string }
/** The business caller separately excludes quantities already reserved by confirmed returns. */
async function restoreInventoryUnchecked(context: OperationContext, input: { sourceKind: 'order_revision_release' | 'return_restock' | 'order_void'; sourceId: string; selections: readonly RestoreSelection[] }): Promise<RestoredAllocation[]> {
  if (new Set(input.selections.map(selection => selection.allocationId)).size !== input.selections.length) inventoryError('RELATED_RECORD_CONFLICT', '同一来源不得重复回补');
  const originals = await context.client.query<{ source_line_id: string; batch_id: string; product_id: string; warehouse_id: string; quantity_delta_base: string; cost_delta_amount: string }>('SELECT source_line_id,batch_id,product_id,warehouse_id,quantity_delta_base,cost_delta_amount FROM stock_movements WHERE source_kind=$1 AND source_line_id=ANY($2::uuid[])', ['sale_issue', input.selections.map(selection => selection.allocationId)]);
  if (originals.rows.length !== input.selections.length) inventoryError('RELATED_RECORD_CONFLICT', '原库存消耗来源不存在');
  const keys = originals.rows.map(row => ({ productId: row.product_id, warehouseId: row.warehouse_id }));
  await lockStockBalances(context.client, keys); const locked = await lockBatches(context.client, keys);
  const restored: RestoredAllocation[] = [];
  for (const selection of input.selections) {
    const source = originals.rows.find(row => row.source_line_id === selection.allocationId.toLowerCase())!;
    const batch = locked.rows.find(batch => batch.id === source.batch_id)!;
    const totals = await context.client.query<{ quantity: string; amount: string }>(`SELECT COALESCE(sum(quantity_delta_base),0) AS quantity,COALESCE(sum(cost_delta_amount),0)::numeric(20,2)::text AS amount FROM stock_movements WHERE source_line_id=$1 AND quantity_delta_base>0`, [selection.allocationId]);
    const totalQuantity = -BigInt(source.quantity_delta_base); const totalCost = -BigInt(source.cost_delta_amount.replace('.', ''));
    const restoredQuantity = BigInt(totals.rows[0]!.quantity); const restoredCost = parseMoney(totals.rows[0]!.amount);
    const amount = quantity(selection.quantityBase);
    if (restoredQuantity + amount > totalQuantity) inventoryError('RELATED_RECORD_CONFLICT', '回补数量超过原来源剩余量');
    const remainingQuantity = totalQuantity - restoredQuantity; const remainingCost = totalCost - restoredCost;
    const cost = selection.costAmount === undefined ? allocateFromSource({ quantity: remainingQuantity, amount: remainingCost, allocatedQuantity: 0n, allocatedAmount: 0n }, amount).amount : parseMoney(selection.costAmount);
    if (cost > remainingCost || (amount === remainingQuantity && cost !== remainingCost)) inventoryError('RELATED_RECORD_CONFLICT', '回补成本超过原来源或末次成本不守恒');
    await changeBatch(context, batch, amount, cost, { sourceKind: input.sourceKind, sourceId: input.sourceId, sourceLineId: selection.allocationId, effectSlot: 'restore' });
    restored.push({ allocationId: selection.allocationId, batchId: batch.id, quantityBase: selection.quantityBase, costAmount: formatMoney(cost) });
  }
  return restored;
}

/** Caller supplies only unreturned, unreleased eligible sources; ties are deterministic. */
export function selectReleaseSources<T extends { id: string; issueSequence: number; availableQuantityBase: number }>(sources: readonly T[], requested: number): { allocationId: string; quantityBase: number }[] {
  let remaining = quantity(requested); const result: { allocationId: string; quantityBase: number }[] = [];
  for (const source of [...sources].sort((a, b) => b.issueSequence - a.issueSequence || b.id.localeCompare(a.id))) {
    const available = quantity(source.availableQuantityBase, true); const amount = available < remaining ? available : remaining;
    if (amount) { result.push({ allocationId: source.id, quantityBase: safeNumber(amount) }); remaining -= amount; }
    if (!remaining) return result;
  }
  return inventoryError('RELATED_RECORD_CONFLICT', '可回补来源数量不足');
}

/** Repair selected materialized anchors only after independent batch and immutable-ledger totals agree. */
export async function rebuildStockBalances(client: PoolClient, keys: readonly StockKey[]): Promise<void> {
  await lockStockBalances(client, keys); await lockBatches(client, keys);
  for (const key of new Map(keys.map(key => [stockKey(key), key])).values()) {
    const result = await client.query<{ batch_quantity: string; batch_cost: string; movement_quantity: string; movement_cost: string }>(`SELECT
      (SELECT COALESCE(sum(remaining_quantity_base),0)::text FROM inventory_batches WHERE product_id=$1 AND warehouse_id=$2) AS batch_quantity,
      (SELECT COALESCE(sum(remaining_cost_amount),0)::numeric(20,2)::text FROM inventory_batches WHERE product_id=$1 AND warehouse_id=$2) AS batch_cost,
      (SELECT COALESCE(sum(quantity_delta_base),0)::text FROM stock_movements WHERE product_id=$1 AND warehouse_id=$2) AS movement_quantity,
      (SELECT COALESCE(sum(cost_delta_amount),0)::numeric(20,2)::text FROM stock_movements WHERE product_id=$1 AND warehouse_id=$2) AS movement_cost`, [key.productId, key.warehouseId]);
    const totals = result.rows[0]!;
    if (totals.batch_quantity !== totals.movement_quantity || totals.batch_cost !== totals.movement_cost) inventoryError('RELATED_RECORD_CONFLICT', '批次与来源流水不一致，拒绝重建汇总');
    quantity(BigInt(totals.batch_quantity), true); parseMoney(totals.batch_cost);
    await client.query('UPDATE stock_balances SET quantity_base=$3,cost_amount=$4,version=version+1 WHERE product_id=$1 AND warehouse_id=$2', [key.productId, key.warehouseId, totals.batch_quantity, totals.batch_cost]);
  }
}

/** Converts integer/decimal boundary failures to a non-retryable business validation error. */
export async function issueInventory(context: OperationContext, input: { sourceId: string; lines: readonly IssueLine[] }): Promise<InventoryAllocation[]> {
  try { return await issueInventoryUnchecked(context, input); }
  catch (error) { if (error instanceof RangeError) throw new AppError('INVALID_QUANTITY', 422, '库存需求数量或成本超过安全范围'); throw error; }
}
export async function restoreInventory(context: OperationContext, input: { sourceKind: 'order_revision_release' | 'return_restock' | 'order_void'; sourceId: string; selections: readonly RestoreSelection[] }): Promise<RestoredAllocation[]> {
  try { return await restoreInventoryUnchecked(context, input); }
  catch (error) { if (error instanceof RangeError) throw new AppError('INVALID_QUANTITY', 422, '回补数量或成本超过安全范围'); throw error; }
}
