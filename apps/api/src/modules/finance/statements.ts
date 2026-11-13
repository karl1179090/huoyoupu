import {randomUUID} from 'node:crypto';
import type {components} from '@huoyoupu/contracts';
import {formatMoney} from '@huoyoupu/money';
import type {OperationContext} from '../../lib/security.js';
import {appendAudit} from '../../lib/audit.js';
import {AppError} from '../../lib/errors.js';
import {assertCustomer, instant, signed, lockAccounts, checkMoney, type Sql} from './core.js';
import {decodeCursor, encodeCursor, ledgerDto, period, queryHash} from './queries.js';
type Row = Record<string, unknown> & {id:string;effective_at:Date;amount_signed:string;category:string};
async function sources(sql: Sql, customerId: string, end: string): Promise<Row[]> {
  return (await sql.query<Row>('SELECT * FROM customer_ledger_entries WHERE customer_id=$1 AND effective_at<$2 ORDER BY effective_at,recorded_at,id',[customerId,end])).rows;
}
function watermark(rows: Row[]) {return queryHash(rows.map(row=>row.id));}
export async function getStatement(sql: Sql, id: string, query: {cursor?:string;limit?:number}={}):Promise<components['schemas']['Statement']> {
  const row=(await sql.query('SELECT * FROM statement_snapshots WHERE id=$1',[id])).rows[0];
  if(!row)throw new AppError('NOT_FOUND',404,'对账单快照不存在');
  const scope=queryHash({statement:id});
  const offset=decodeCursor(scope,query.cursor,(v):v is number=>Number.isSafeInteger(v)&&Number(v)>=0)??0;
  const all=row.rows_snapshot as components['schemas']['LedgerEntry'][];
  if(offset>all.length)throw new AppError('INVALID_REQUEST',400,'快照游标超出范围');
  const limit=query.limit??50;
  return {id,customerId:row.customer_id,periodStart:instant(row.period_start),periodEnd:instant(row.period_end),asOf:instant(row.as_of),sourceWatermark:row.source_watermark,
    openingBalance:row.opening_balance,salesAmount:row.sales_amount,returnAmount:row.return_amount,receiptAmount:row.receipt_amount,refundAmount:row.refund_amount,closingBalance:row.closing_balance,
    stale:watermark(await sources(sql,row.customer_id,instant(row.period_end)))!==row.source_watermark,rows:all.slice(offset,offset+limit),rowCount:all.length,nextCursor:offset+limit<all.length?encodeCursor(scope,offset+limit):null};
}
export async function createStatement(context:OperationContext,customerId:string,input:components['schemas']['StatementInput']) {
  period(input.periodStart,input.periodEnd);
  await lockAccounts(context.client,[customerId]);
  const all=await sources(context.client,customerId,input.periodEnd), start=Date.parse(input.periodStart);
  let opening=0n,sales=0n,returns=0n,receipts=0n,refunds=0n;
  const rows:Row[]=[];
  for(const row of all){
    const amount=signed(row.amount_signed);
    if(new Date(row.effective_at).getTime()<start){opening+=amount;continue;}
    rows.push(row);
    switch(row.category){case 'opening':opening+=amount;break;case 'sale':sales+=amount;break;case 'return':returns-=amount;break;case 'receipt':receipts-=amount;break;case 'refund':refunds+=amount;break;}
  }
  const closing=opening+sales-returns-receipts+refunds;
  for(const value of [opening,sales,returns,receipts,refunds,closing])checkMoney(value);
  if([sales,returns,receipts,refunds].some(value=>value<0n))throw new AppError('RELATED_RECORD_CONFLICT',409,'期间分类金额不一致');
  const id=randomUUID();
  await context.client.query(`INSERT INTO statement_snapshots(id,customer_id,period_start,period_end,source_watermark,opening_balance,sales_amount,return_amount,receipt_amount,refund_amount,closing_balance,query_snapshot,rows_snapshot,operation_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[id,customerId,input.periodStart,input.periodEnd,watermark(all),...[opening,sales,returns,receipts,refunds,closing].map(formatMoney),JSON.stringify(input),JSON.stringify(rows.map(ledgerDto)),context.operationId]);
  const result=await getStatement(context.client,id);
  await appendAudit(context,{entityType:'statement',entityId:id,after:result});return result;
}
export async function listStatements(sql:Sql,customerId:string,query:{cursor?:string;limit?:number}={}) {
  await assertCustomer(sql,customerId);
  const scope=queryHash({statements:customerId});
  const offset=decodeCursor(scope,query.cursor,(v):v is number=>Number.isSafeInteger(v)&&Number(v)>=0)??0,limit=query.limit??50;
  const rows=(await sql.query('SELECT id FROM statement_snapshots WHERE customer_id=$1 ORDER BY created_at,id LIMIT $2 OFFSET $3',[customerId,limit+1,offset])).rows;
  return {items:await Promise.all(rows.slice(0,limit).map(row=>getStatement(sql,row.id))),nextCursor:rows.length>limit?encodeCursor(scope,offset+limit):null,asOf:new Date().toISOString()};
}
