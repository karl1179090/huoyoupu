import {createHash} from 'node:crypto';
import type {components} from '@huoyoupu/contracts';
import {AppError} from '../../lib/errors.js';
import {assertCustomer, instant, type Sql} from './core.js';
import {getCash} from './cash.js';
export const queryHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function encodeCursor(scope: string, value: unknown): string {return Buffer.from(JSON.stringify({scope, value})).toString('base64url');}
export function decodeCursor<T>(scope: string, cursor: string | undefined, validate: (value: unknown) => value is T): T | undefined {
  if (!cursor) return undefined;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as {scope: unknown; value: unknown};
    if (decoded.scope !== scope || !validate(decoded.value)) throw new Error();
    return decoded.value;
  } catch {throw new AppError('INVALID_REQUEST', 400, '分页游标无效或不属于本查询');}
}
interface TimeCursor {at: string; id: string}
const isTimeCursor = (value: unknown): value is TimeCursor => !!value && typeof value === 'object' && 'at' in value && typeof value.at === 'string' && Number.isFinite(Date.parse(value.at)) && 'id' in value && typeof value.id === 'string' && /^[0-9a-f-]{36}$/i.test(value.id);
export function ledgerDto(row: Record<string, unknown>): components['schemas']['LedgerEntry'] {
  return {id: String(row.id), customerId: String(row.customer_id), kind: String(row.kind), amount: String(row.amount_signed), effectiveAt: instant(row.effective_at as Date), recordedAt: instant(row.recorded_at as Date), sourceType: String(row.source_type), sourceId: String(row.source_id), sourceVersion: row.source_version == null ? null : Number(row.source_version), reversesId: row.reverses_id == null ? null : String(row.reverses_id)};
}
export function period(from?: string, to?: string): void {
  if (from && to && Date.parse(to) <= Date.parse(from)) throw new AppError('INVALID_REQUEST', 400, '查询结束时间须晚于开始时间');
}
export async function listLedger(sql: Sql, customerId: string, query: {from?: string; to?: string; cursor?: string; limit?: number}) {
  await assertCustomer(sql, customerId); period(query.from, query.to);
  const scope = queryHash({kind: 'ledger', customerId, from: query.from, to: query.to});
  const cursor = decodeCursor(scope, query.cursor, isTimeCursor), limit = query.limit ?? 50;
  // id is stable; registration time isn't reinterpreted as the business date.
  const rows = (await sql.query(`SELECT *,to_char(recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at FROM customer_ledger_entries WHERE customer_id=$1
    AND ($2::timestamptz IS NULL OR effective_at>=$2) AND ($3::timestamptz IS NULL OR effective_at<$3)
    AND ($4::timestamptz IS NULL OR (recorded_at,id)>($4::timestamptz,$5::uuid)) ORDER BY recorded_at,id LIMIT $6`,
    [customerId, query.from ?? null, query.to ?? null, cursor?.at ?? null, cursor?.id ?? null, limit + 1])).rows;
  const page = rows.slice(0, limit), last = page.at(-1);
  return {items: page.map(ledgerDto), nextCursor: rows.length > limit && last ? encodeCursor(scope, {at: String(last.cursor_at), id: last.id}) : null, asOf: new Date().toISOString()};
}
export async function listCash(sql: Sql, query: {customerId?: string; from?: string; to?: string; cursor?: string; limit?: number}) {
  period(query.from, query.to);
  if (query.customerId) await assertCustomer(sql, query.customerId);
  const scope = queryHash({kind: 'cash', customerId: query.customerId, from: query.from, to: query.to});
  const cursor = decodeCursor(scope, query.cursor, isTimeCursor), limit = query.limit ?? 50;
  const rows = (await sql.query(`SELECT id,occurred_at,to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at FROM cash_events WHERE ($1::uuid IS NULL OR customer_id=$1)
    AND ($2::timestamptz IS NULL OR occurred_at>=$2) AND ($3::timestamptz IS NULL OR occurred_at<$3)
    AND ($4::timestamptz IS NULL OR (occurred_at,id)>($4::timestamptz,$5::uuid)) ORDER BY occurred_at,id LIMIT $6`,
    [query.customerId ?? null, query.from ?? null, query.to ?? null, cursor?.at ?? null, cursor?.id ?? null, limit + 1])).rows;
  const page = rows.slice(0, limit), last = page.at(-1);
  return {items: await Promise.all(page.map(row => getCash(sql, String(row.id)))), nextCursor: rows.length > limit && last ? encodeCursor(scope, {at: String(last.cursor_at), id: last.id}) : null, asOf: new Date().toISOString()};
}
