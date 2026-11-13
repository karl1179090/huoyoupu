import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {parseMoney, formatMoney} from '@huoyoupu/money';
import {AppError} from '../../lib/errors.js';
import {activeAllocations, availableSources, orderDebt, signed} from './core.js';
export interface OrderPayment {orderId: string; amount: string}
export async function lockOrders(client: PoolClient, ids: readonly string[]): Promise<void> {
  for (const id of [...new Set(ids)].sort()) {
    if (!(await client.query('SELECT id FROM sales_orders WHERE id=$1 FOR UPDATE', [id])).rowCount) throw new AppError('NOT_FOUND', 404, '订单不存在');
  }
}
export async function orderOutstanding(client: PoolClient, customerId: string, orderId: string): Promise<bigint> {
  const order = (await client.query('SELECT customer_id,status FROM sales_orders WHERE id=$1', [orderId])).rows[0];
  if (!order || order.customer_id !== customerId || order.status !== 'confirmed') throw new AppError('INVALID_CUSTOMER_ALLOCATION', 422, '核销订单不属于该客户或状态不符');
  const debt = await orderDebt(client, orderId, customerId);
  const paid = (await activeAllocations(client, customerId)).filter(row => row.target_order_id === orderId).reduce((sum, row) => sum + signed(row.remaining), 0n);
  return debt > paid ? debt - paid : 0n;
}
export async function allocateFunds(client: PoolClient, customerId: string, operationId: string, targets: readonly {orderId?: string; refundId?: string; amount: bigint}[], sourceIds?: readonly string[]): Promise<void> {
  const sources = (await availableSources(client, customerId)).filter(source => !sourceIds || sourceIds.includes(source.id));
  const total = targets.reduce((sum, target) => sum + target.amount, 0n);
  if (targets.some(target => target.amount <= 0n) || total > sources.reduce((sum, source) => sum + source.available, 0n)) throw new AppError('INSUFFICIENT_CUSTOMER_CREDIT', 422, '可用资金来源不足');
  for (const target of targets) {
    if (!!target.orderId === !!target.refundId) throw new AppError('INVALID_CUSTOMER_ALLOCATION', 422, '核销目标不合法');
    if (target.orderId && target.amount > await orderOutstanding(client, customerId, target.orderId)) throw new AppError('INVALID_CUSTOMER_ALLOCATION', 422, '核销超过订单未结金额');
    if (target.refundId) {
      const refund = (await client.query('SELECT amount,customer_id,kind,status FROM cash_events WHERE id=$1', [target.refundId])).rows[0];
      if (!refund || refund.customer_id !== customerId || refund.kind !== 'refund' || refund.status !== 'active') throw new AppError('INVALID_CUSTOMER_ALLOCATION', 422, '退款来源不合法');
      const used = (await activeAllocations(client, customerId)).filter(row => row.target_refund_id === target.refundId).reduce((sum, row) => sum + signed(row.remaining), 0n);
      if (used + target.amount > signed(refund.amount)) throw new AppError('INVALID_CUSTOMER_ALLOCATION', 422, '退款核销超过实际金额');
    }
    let needed = target.amount;
    for (const source of sources) {
      if (needed === 0n) break;
      const amount = source.available < needed ? source.available : needed;
      if (amount === 0n) continue;
      await client.query(`INSERT INTO settlement_allocations
        (id,customer_id,source_ledger_entry_id,target_order_id,target_refund_id,kind,amount,operation_id)
        VALUES ($1,$2,$3,$4,$5,'allocate',$6,$7)`, [randomUUID(), customerId, source.id, target.orderId ?? null, target.refundId ?? null, formatMoney(amount), operationId]);
      source.available -= amount; needed -= amount;
    }
  }
}
export async function manualTargets(client: PoolClient, customerId: string, allocations: readonly OrderPayment[], maximum?: bigint) {
  if (new Set(allocations.map(item => item.orderId)).size !== allocations.length) throw new AppError('INVALID_CUSTOMER_ALLOCATION', 422, '同一订单不能重复指定');
  const targets = allocations.map(item => ({orderId: item.orderId, amount: parseMoney(item.amount)}));
  const total = targets.reduce((sum, item) => sum + item.amount, 0n);
  if (maximum !== undefined && total > maximum) throw new AppError('INVALID_CUSTOMER_ALLOCATION', 422, '指定核销超过本次收款金额');
  for (const target of targets) if (target.amount > await orderOutstanding(client, customerId, target.orderId)) throw new AppError('INVALID_CUSTOMER_ALLOCATION', 422, '指定核销超过订单未结金额');
  return targets;
}
export async function automaticTargets(client: PoolClient, customerId: string, maximum: bigint, lockedOrderIds: readonly string[]) {
  const orders = (await client.query<{id: string}>('SELECT id FROM sales_orders WHERE customer_id=$1 AND status=\'confirmed\' AND id=ANY($2::uuid[]) ORDER BY confirmed_at,id', [customerId, lockedOrderIds])).rows;
  const targets: {orderId: string; amount: bigint}[] = [];
  let remaining = maximum;
  for (const order of orders) {
    if (remaining === 0n) break;
    const due = await orderOutstanding(client, customerId, order.id);
    const amount = due < remaining ? due : remaining;
    if (amount > 0n) targets.push({orderId: order.id, amount});
    remaining -= amount;
  }
  return targets;
}
