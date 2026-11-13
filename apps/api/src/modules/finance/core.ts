import {randomUUID} from 'node:crypto';
import type {Pool, PoolClient} from 'pg';
import {parseMoney, formatMoney, MAX_CENTS} from '@huoyoupu/money';
import type {components} from '@huoyoupu/contracts';
import {AppError} from '../../lib/errors.js';
import type {FinancePort, CommercialChange, CommercialOperation, CommercialSource, AccountChange} from './port.js';
export type Sql = Pick<Pool | PoolClient, 'query'>;
export function signed(value: string): bigint {
  if (/^-?[0-9]+$/.test(value)) value += '.00';
  return value.startsWith('-') ? -parseMoney(value.slice(1)) : parseMoney(value);
}
export const instant = (value: Date | string): string => new Date(value).toISOString();
export function checkMoney(value: bigint): bigint {
  if (value > MAX_CENTS || value < -MAX_CENTS) throw new AppError('INVALID_REQUEST', 422, '金额合计超过精度上限');
  return value;
}
export async function assertCustomer(sql: Sql, customerId: string): Promise<void> {
  if (!(await sql.query('SELECT id FROM customers WHERE id=$1', [customerId])).rowCount) throw new AppError('NOT_FOUND', 404, '客户不存在');
}
export async function lockAccounts(client: PoolClient, customerIds: readonly string[]): Promise<void> {
  for (const id of [...new Set(customerIds)].sort()) {
    await assertCustomer(client, id);
    await client.query('INSERT INTO customer_accounts(customer_id) VALUES ($1) ON CONFLICT DO NOTHING', [id]);
    await client.query('SELECT customer_id FROM customer_accounts WHERE customer_id=$1 FOR UPDATE', [id]);
  }
}
export async function availableSources(sql: Sql, customerId: string) {
  const result = await sql.query<{id: string; amount_signed: string; available: string}>(`SELECT e.id,e.amount_signed,
    -e.amount_signed-COALESCE((SELECT SUM(CASE WHEN a.kind='allocate' THEN a.amount ELSE -a.amount END) FROM settlement_allocations a WHERE a.source_ledger_entry_id=e.id),0) AS available
    FROM customer_ledger_entries e WHERE e.customer_id=$1 AND e.kind IN ('receipt','opening') AND e.amount_signed<0
      AND NOT EXISTS (SELECT 1 FROM customer_ledger_entries r WHERE r.reverses_id=e.id)
    ORDER BY e.effective_at,e.recorded_at,e.id`, [customerId]);
  return result.rows.map(row => ({id: row.id, available: signed(row.available)}));
}
export async function readBalance(sql: Sql, customerId: string): Promise<components['schemas']['CustomerBalance']> {
  await assertCustomer(sql, customerId);
  const row = (await sql.query<{net_balance: string; version: string}>('SELECT net_balance,version FROM customer_accounts WHERE customer_id=$1', [customerId])).rows[0];
  const net = row ? signed(row.net_balance) : 0n;
  const unallocated = (await availableSources(sql, customerId)).reduce((sum, source) => sum + source.available, 0n);
  return {customerId, netBalance: formatMoney(net), receivableBalance: formatMoney(net > 0n ? net : 0n), creditBalance: formatMoney(net < 0n ? -net : 0n), unallocatedAmount: formatMoney(checkMoney(unallocated)), version: row ? Number(row.version) : 1, asOf: new Date().toISOString()};
}
export interface LedgerWrite {
  customerId: string; operationId: string; kind: string; category: string; sourceType: string; sourceId: string;
  sourceVersion?: number; orderId?: string; amountSigned: bigint; effectiveAt: Date; reversesId?: string; reclassifiesId?: string;
}
export async function appendLedger(client: PoolClient, entry: LedgerWrite): Promise<string> {
  checkMoney(entry.amountSigned);
  const id = randomUUID();
  await client.query(`INSERT INTO customer_ledger_entries
    (id,customer_id,operation_id,kind,category,source_type,source_id,source_version,order_id,amount_signed,effective_at,reverses_id,reclassifies_id,effect_slot)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,(SELECT count(*) FROM customer_ledger_entries WHERE operation_id=$3))`,
  [id, entry.customerId, entry.operationId, entry.kind, entry.category, entry.sourceType, entry.sourceId, entry.sourceVersion ?? null, entry.orderId ?? null,
    formatMoney(entry.amountSigned), entry.effectiveAt, entry.reversesId ?? null, entry.reclassifiesId ?? null]);
  await client.query('UPDATE customer_accounts SET net_balance=net_balance+$2::numeric,version=version+1 WHERE customer_id=$1', [entry.customerId, formatMoney(entry.amountSigned)]);
  return id;
}
export async function orderDebt(sql: Sql, orderId: string, customerId: string): Promise<bigint> {
  const row = (await sql.query<{amount: string}>(`SELECT COALESCE(SUM(amount_signed),0) AS amount FROM customer_ledger_entries WHERE order_id=$1 AND customer_id=$2 AND category IN ('sale','return')`, [orderId, customerId])).rows[0]!;
  const amount = signed(row.amount);
  return amount > 0n ? amount : 0n;
}
export interface ActiveAllocation {id: string; source_ledger_entry_id: string; target_order_id: string | null; target_refund_id: string | null; remaining: string}
export async function activeAllocations(sql: Sql, customerId: string): Promise<ActiveAllocation[]> {
  return (await sql.query<ActiveAllocation>(`SELECT a.id,a.source_ledger_entry_id,a.target_order_id,a.target_refund_id,
      a.amount-COALESCE((SELECT SUM(r.amount) FROM settlement_allocations r WHERE r.reverses_allocation_id=a.id),0) AS remaining
    FROM settlement_allocations a WHERE a.customer_id=$1 AND a.kind='allocate'
      AND a.amount>COALESCE((SELECT SUM(r.amount) FROM settlement_allocations r WHERE r.reverses_allocation_id=a.id),0)
    ORDER BY a.recorded_at DESC,a.id DESC`, [customerId])).rows;
}
export async function releaseAllocation(client: PoolClient, customerId: string, operationId: string, allocation: ActiveAllocation, amount: bigint): Promise<void> {
  if (amount <= 0n || amount > signed(allocation.remaining)) throw new AppError('RELATED_RECORD_CONFLICT', 409, '核销释放超过原来源');
  await client.query(`INSERT INTO settlement_allocations
    (id,customer_id,source_ledger_entry_id,target_order_id,target_refund_id,kind,amount,reverses_allocation_id,operation_id)
    VALUES ($1,$2,$3,$4,$5,'release',$6,$7,$8)`, [randomUUID(), customerId, allocation.source_ledger_entry_id, allocation.target_order_id, allocation.target_refund_id, formatMoney(amount), allocation.id, operationId]);
}
export async function reconcileCustomer(client: PoolClient, customerId: string, operationId: string, affectedOrderId?: string): Promise<void> {
  const allocations = await activeAllocations(client, customerId);
  const grouped = new Map<string, ActiveAllocation[]>();
  for (const allocation of allocations) if (allocation.target_order_id) {
    const group = grouped.get(allocation.target_order_id) ?? [];
    group.push(allocation); grouped.set(allocation.target_order_id, group);
  }
  for (const [orderId, group] of grouped) {
    if (affectedOrderId && affectedOrderId !== orderId) continue;
    const order = (await client.query('SELECT customer_id,status FROM sales_orders WHERE id=$1', [orderId])).rows[0];
    const capacity = order?.customer_id === customerId && order.status === 'confirmed' ? await orderDebt(client, orderId, customerId) : 0n;
    const paid = group.reduce((sum, row) => sum + signed(row.remaining), 0n);
    let surplus = paid > capacity ? paid - capacity : 0n;
    for (const allocation of group) {
      if (surplus === 0n) break;
      const available = signed(allocation.remaining), release = surplus < available ? surplus : available;
      await releaseAllocation(client, customerId, operationId, allocation, release);
      surplus -= release;
    }
  }
}
export async function previewCommercial(client: PoolClient, changes: readonly CommercialChange[]): Promise<AccountChange[]> {
  const ids = [...new Set(changes.map(change => change.customerId))].sort();
  const result: AccountChange[] = [];
  for (const customerId of ids) {
    const before = await readBalance(client, customerId);
    const delta = changes.filter(change => change.customerId === customerId).reduce((sum, change) => sum + change.amountSigned, 0n);
    result.push({customerId, beforeNetBalance: before.netBalance, afterNetBalance: formatMoney(checkMoney(signed(before.netBalance) + delta))});
  }
  return result;
}
export async function applyCommercial(client: PoolClient, operation: CommercialOperation): Promise<AccountChange[]> {
  await lockAccounts(client, operation.changes.map(change => change.customerId));
  const impact = await previewCommercial(client, operation.changes);
  for (const change of operation.changes) {
    let category: string = change.kind;
    let sourceType = change.kind === 'return' ? 'sales_return' : 'order';
    const referenced = change.reversesId ?? change.reclassifiesId;
    if (change.kind === 'reversal' || change.kind === 'reclassification') {
      if (!referenced) throw new AppError('RELATED_RECORD_CONFLICT', 409, '商业更正需要原分录来源');
      const original = (await client.query('SELECT * FROM customer_ledger_entries WHERE id=$1 AND order_id=$2', [referenced, operation.orderId])).rows[0];
      if (!original || !['sale', 'return'].includes(String(original.category))) throw new AppError('RELATED_RECORD_CONFLICT', 409, '商业来源不属于订单');
      if (String(original.source_id)!==change.sourceId || Number(original.source_version)!==change.sourceVersion) throw new AppError('RELATED_RECORD_CONFLICT',409,'更正须保留原业务来源和版本');
      if (instant(original.effective_at) !== instant(change.effectiveAt)) throw new AppError('RELATED_RECORD_CONFLICT', 409, '更正必须保留原分录业务日期');
      if (change.reversesId && (await client.query('SELECT id FROM customer_ledger_entries WHERE reverses_id=$1',[original.id])).rowCount) throw new AppError('RELATED_RECORD_CONFLICT',409,'原商业来源已经冲正');
      if (change.reversesId && (original.customer_id !== change.customerId || signed(original.amount_signed) !== -change.amountSigned)) throw new AppError('RELATED_RECORD_CONFLICT', 409, '冲正客户或金额与原来源不一致');
      if (change.reclassifiesId && signed(original.amount_signed) !== change.amountSigned) throw new AppError('RELATED_RECORD_CONFLICT', 409, '重分类金额与原来源不一致');
      category = String(original.category); sourceType = String(original.source_type);
    }
    if (!['sale', 'return'].includes(category)) throw new AppError('INVALID_REQUEST', 422, '非法商业分录类别');
    await appendLedger(client, {customerId: change.customerId, operationId: operation.operationId, kind: change.kind, category, sourceType, sourceId: change.sourceId,
      sourceVersion: change.sourceVersion, orderId: operation.orderId, amountSigned: change.amountSigned, effectiveAt: change.effectiveAt,
      ...(change.reversesId ? {reversesId: change.reversesId} : {}), ...(change.reclassifiesId ? {reclassifiesId: change.reclassifiesId} : {})});
  }
  for (const customerId of [...new Set(operation.changes.map(change => change.customerId))].sort()) await reconcileCustomer(client, customerId, operation.operationId, operation.orderId);
  return impact;
}
export async function listCommercial(client: PoolClient, orderId: string, customerId?: string): Promise<CommercialSource[]> {
  const rows = (await client.query(`SELECT * FROM customer_ledger_entries WHERE order_id=$1 AND category IN ('sale','return') AND ($2::uuid IS NULL OR customer_id=$2) ORDER BY effective_at,recorded_at,id`, [orderId, customerId ?? null])).rows;
  return rows.map(row => ({id: String(row.id), orderId, customerId: String(row.customer_id), kind: row.kind as CommercialChange['kind'], sourceId: String(row.source_id), sourceVersion: Number(row.source_version), amountSigned: signed(String(row.amount_signed)), effectiveAt: new Date(row.effective_at),
    ...(row.reverses_id ? {reversesId: String(row.reverses_id)} : {}), ...(row.reclassifies_id ? {reclassifiesId: String(row.reclassifies_id)} : {})}));
}
export const financePort: FinancePort = {lockAccounts, applyCommercial, previewCommercial, listCommercial};
