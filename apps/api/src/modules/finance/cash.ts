import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {components} from '@huoyoupu/contracts';
import {parseMoney, formatMoney} from '@huoyoupu/money';
import type {OperationContext} from '../../lib/security.js';
import {AppError} from '../../lib/errors.js';
import {appendAudit} from '../../lib/audit.js';
import {activeAllocations, appendLedger, assertCustomer, instant, lockAccounts, readBalance, releaseAllocation, signed, type Sql} from './core.js';
import {allocateFunds, automaticTargets, lockOrders, manualTargets} from './settlements.js';
type CashInput = components['schemas']['CashInput'];
export function actualDate(value: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 1000) throw new AppError('INVALID_REQUEST', 422, '实际发生时间不能在未来');
  return date;
}
export async function getCash(sql: Sql, cashId: string): Promise<components['schemas']['CashEvent']> {
  const row = (await sql.query('SELECT e.*,c.name AS customer_name FROM cash_events e JOIN customers c ON c.id=e.customer_id WHERE e.id=$1', [cashId])).rows[0];
  if (!row) throw new AppError('NOT_FOUND', 404, '资金记录不存在');
  const allocations = (await sql.query(`SELECT * FROM settlement_allocations WHERE source_ledger_entry_id=$1 OR target_refund_id=$2 ORDER BY recorded_at,id`, [row.ledger_entry_id, cashId])).rows;
  return {id: String(row.id), customerId: String(row.customer_id), customerName: String(row.customer_name), kind: row.kind as 'receipt' | 'refund', amount: String(row.amount), occurredAt: instant(row.occurred_at), recordedAt: instant(row.recorded_at), method: String(row.method), reference: String(row.reference), note: String(row.note), relatedReturnId: row.related_return_id as string | null, status: row.status as 'active' | 'reversed', version: Number(row.version),
    allocations: allocations.map(allocation => ({id: String(allocation.id), sourceEntryId: String(allocation.source_ledger_entry_id), orderId: allocation.target_order_id as string | null, refundId: allocation.target_refund_id as string | null, kind: allocation.kind as 'allocate' | 'release', amount: String(allocation.amount)})), balance: await readBalance(sql, String(row.customer_id))};
}
export async function recordOpening(context: OperationContext, customerId: string, input: components['schemas']['OpeningBalanceInput']) {
  const amount = signed(input.amount);
  const effectiveAt = actualDate(input.effectiveAt);
  if (amount === 0n || !input.reason.trim()) throw new AppError('INVALID_REQUEST', 422, '期初需要非零金额及原因');
  await lockAccounts(context.client, [customerId]);
  if ((await context.client.query('SELECT id FROM opening_balances WHERE customer_id=$1 AND effective_at=$2', [customerId, effectiveAt])).rowCount) throw new AppError('OPENING_EXISTS', 409, '该客户切换时点已有期初');
  const id = randomUUID();
  const ledgerId = await appendLedger(context.client, {customerId, operationId: context.operationId, kind: 'opening', category: 'opening', sourceType: 'opening_balance', sourceId: id, amountSigned: amount, effectiveAt});
  await context.client.query('INSERT INTO opening_balances (id,customer_id,amount,effective_at,reason,ledger_entry_id,operation_id) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, customerId, formatMoney(amount), effectiveAt, input.reason.trim(), ledgerId, context.operationId]);
  const balance = await readBalance(context.client, customerId);
  await appendAudit(context, {entityType: 'opening_balance', entityId: id, after: {customerId, amount: input.amount, effectiveAt: input.effectiveAt, reason: input.reason}});
  return balance;
}
export async function recordCash(context: OperationContext, input: CashInput) {
  const client = context.client;
  const amount = parseMoney(input.amount), occurredAt = actualDate(input.occurredAt);
  const customerId = input.customerId;
  await assertCustomer(client, customerId);
  const candidates = input.kind === 'receipt' && input.allocationMode === 'auto'
    ? (await client.query<{id: string}>('SELECT id FROM sales_orders WHERE customer_id=$1 AND status=\'confirmed\' ORDER BY id', [customerId])).rows.map(row => row.id)
    : input.kind === 'receipt' ? (input.allocations ?? []).map(item => item.orderId) : [];
  let relatedOrder: string | undefined;
  if (input.kind === 'refund' && input.relatedReturnId) {
    const returned = (await client.query('SELECT order_id FROM sales_returns WHERE id=$1', [input.relatedReturnId])).rows[0];
    if (!returned) throw new AppError('NOT_FOUND', 404, '关联退货不存在');
    relatedOrder = String(returned.order_id);
  }
  await lockOrders(client, [...candidates, ...(relatedOrder ? [relatedOrder] : [])]);
  await lockAccounts(client, [customerId]);
  if (relatedOrder) {
    const order = (await client.query('SELECT customer_id FROM sales_orders WHERE id=$1', [relatedOrder])).rows[0];
    if (order?.customer_id !== customerId) throw new AppError('INVALID_CUSTOMER_ALLOCATION', 422, '关联退货当前不属于该客户');
  }
  if (input.kind === 'receipt') {
    if (input.allocationMode === 'auto' && input.allocations?.length) throw new AppError('INVALID_CUSTOMER_ALLOCATION', 422, '自动核销不能同时指定人工分配');
  } else {
    const balance = await readBalance(client, customerId);
    if (amount > parseMoney(balance.creditBalance)) throw new AppError('INSUFFICIENT_CUSTOMER_CREDIT', 422, '退款超过客户净可用余额');
  }
  const id = randomUUID();
  const ledgerId = await appendLedger(client, {customerId, operationId: context.operationId, kind: input.kind, category: input.kind, sourceType: 'cash_event', sourceId: id, sourceVersion: 1, amountSigned: input.kind === 'receipt' ? -amount : amount, effectiveAt: occurredAt});
  await client.query(`INSERT INTO cash_events
    (id,customer_id,kind,amount,occurred_at,method,reference,note,related_return_id,operation_id,ledger_entry_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [id, customerId, input.kind, input.amount, occurredAt, input.method, input.reference ?? '', input.note ?? '', input.kind === 'refund' ? input.relatedReturnId ?? null : null, context.operationId, ledgerId]);
  if (input.kind === 'receipt') {
    const targets = input.allocationMode === 'auto' ? await automaticTargets(client, customerId, amount, candidates) : await manualTargets(client, customerId, input.allocations ?? [], amount);
    await allocateFunds(client, customerId, context.operationId, targets, [ledgerId]);
  } else await allocateFunds(client, customerId, context.operationId, [{refundId: id, amount}]);
  const result = await getCash(client, id);
  await appendAudit(context, {entityType: 'cash_event', entityId: id, newVersion: 1, after: result});
  return result;
}
export async function applyBalance(context: OperationContext, customerId: string, input: components['schemas']['BalanceApplyInput']) {
  const client = context.client;
  await lockOrders(client, input.allocations.map(item => item.orderId));
  await lockAccounts(client, [customerId]);
  const before = await readBalance(client, customerId);
  if (before.version !== input.expectedVersion) throw new AppError('VERSION_CONFLICT', 409, '客户账户版本已变化', {expectedVersion: input.expectedVersion, actualVersion: before.version});
  const targets = await manualTargets(client, customerId, input.allocations);
  await allocateFunds(client, customerId, context.operationId, targets);
  await client.query('UPDATE customer_accounts SET version=version+1 WHERE customer_id=$1', [customerId]);
  const after = await readBalance(client, customerId);
  await appendAudit(context, {entityType: 'customer_account', entityId: customerId, oldVersion: before.version, newVersion: after.version, before, after});
  return after;
}
export async function reverseCash(context: OperationContext, cashId: string, input: components['schemas']['ReasonInput']) {
  const client = context.client;
  const initial = (await client.query('SELECT * FROM cash_events WHERE id=$1', [cashId])).rows[0];
  if (!initial) throw new AppError('NOT_FOUND', 404, '资金记录不存在');
  const customerId = String(initial.customer_id);
  const targets = (await activeAllocations(client, customerId)).filter(row => row.source_ledger_entry_id === initial.ledger_entry_id || row.target_refund_id === cashId);
  const lockedOrderIds = targets.flatMap(row => row.target_order_id ? [row.target_order_id] : []);
  await lockOrders(client, lockedOrderIds);
  await lockAccounts(client, [customerId]);
  const current = (await client.query('SELECT * FROM cash_events WHERE id=$1 FOR UPDATE', [cashId])).rows[0]!;
  if (Number(current.version) !== input.expectedVersion) throw new AppError('VERSION_CONFLICT', 409, '资金记录版本已变化', {expectedVersion: input.expectedVersion, actualVersion: Number(current.version)});
  if (current.status !== 'active') throw new AppError('RELATED_RECORD_CONFLICT', 409, '资金记录已冲正');
  if (!input.reason.trim()) throw new AppError('INVALID_REQUEST', 400, '需要冲正原因');
  const active = (await activeAllocations(client, customerId)).filter(row => row.source_ledger_entry_id === current.ledger_entry_id || row.target_refund_id === cashId);
  if (active.some(row => row.target_order_id && !lockedOrderIds.includes(row.target_order_id))) throw Object.assign(new Error('Allocation targets changed before account lock'), {code: '40001'});
  if (current.kind === 'receipt' && active.some(row => row.target_refund_id)) throw new AppError('RELATED_RECORD_CONFLICT', 409, '原收款已被实际退款使用，需先处理退款来源');
  for (const allocation of active) await releaseAllocation(client, customerId, context.operationId, allocation, signed(allocation.remaining));
  const correctionId = randomUUID();
  await client.query('INSERT INTO cash_reversals(id,cash_event_id,operation_id,reason) VALUES ($1,$2,$3,$4)', [correctionId, cashId, context.operationId, input.reason.trim()]);
  await appendLedger(client, {customerId, operationId: context.operationId, kind: 'reversal', category: String(current.kind), sourceType: 'cash_event', sourceId: correctionId, sourceVersion: Number(current.version) + 1,
    amountSigned: current.kind === 'receipt' ? parseMoney(current.amount) : -parseMoney(current.amount), effectiveAt: new Date(current.occurred_at), reversesId: String(current.ledger_entry_id)});
  await client.query("UPDATE cash_events SET status='reversed',version=version+1,reversed_by_id=$2 WHERE id=$1", [cashId, correctionId]);
  const result = await getCash(client, cashId);
  await appendAudit(context, {entityType: 'cash_event', entityId: cashId, oldVersion: Number(current.version), newVersion: result.version, before: {id: cashId, status: 'active', amount: String(current.amount)}, after: result});
  return result;
}
