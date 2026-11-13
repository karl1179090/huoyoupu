import type {PoolClient} from 'pg';
import {parseSchema,type SchemaValue} from '@huoyoupu/contracts';
import {AppError} from '../../lib/errors.js';
import type {NormalizedReport} from './query.js';
import type {CommercialFact,CashFact} from './metrics.js';
export type SourceRef=SchemaValue<'SourceRef'>;
export interface SourceSet<T>{rows:T[];sources:SourceRef[]}
export type Sql=Pick<PoolClient,'query'>;
export const iso=(value:Date|string)=>new Date(value).toISOString();
export function source(entityType:SourceRef['entityType'],id:string,recordedAt:Date|string,version:number|null=null,href?:string):SourceRef{
 return parseSchema('SourceRef',{entityType,id,version,recordedAt:iso(recordedAt),href:href??`/api/v1/${entityType==='batch'?'batches':entityType==='cash_event'?'cash-events':entityType==='return'?'returns':entityType==='stocktake'?'stocktakes':entityType==='receipt'?'receipts':entityType==='loss_entry'?'inventory-loss-entries':'ledger-entries'}/${id}`});
}
export function assertBound(count:number,max:number):void{if(count>max)throw new AppError('UNSUPPORTED_QUERY',422,'查询来源过多，请缩小范围');}
export function entityFilters(normalized:NormalizedReport){const f=normalized.query.filters;return [f?.customerIds??null,f?.productIds??null,f?.warehouseIds??null];}
export async function commercialSources(sql:Sql,n:NormalizedReport,max:number):Promise<SourceSet<CommercialFact>>{
 const ranges=[n.currentPeriod!,...(n.baselinePeriod?[n.baselinePeriod]:[])];
 const start=ranges.map(p=>p.start).sort()[0]!,end=ranges.map(p=>p.end).sort().at(-1)!;
 const values=[...entityFilters(n),start,end,max+1];
 // Current revision is the commercial truth; confirmed_at remains the original period.
 const sales=await sql.query<{fact:CommercialFact;revision_id:string;revision_no:string;created_at:Date;order_id:string}>(`SELECT jsonb_build_object('kind','sale','orderId',o.id,'at',o.confirmed_at,'customerId',o.customer_id,'customerName',c.name,
 'productId',l.product_id,'productName',p.name,'baseUnitName',u.name,'warehouseId',l.warehouse_id,'quantityBase',l.quantity_base,'amount',l.net_amount::text,'costAmount',l.cost_amount::text) AS fact,
 r.id AS revision_id,r.revision_no,r.created_at,o.id AS order_id
 FROM sales_orders o JOIN order_revisions r ON r.id=o.current_revision_id JOIN revision_lines l ON l.revision_id=r.id
 JOIN customers c ON c.id=o.customer_id JOIN products p ON p.id=l.product_id JOIN product_units u ON u.id=p.base_unit_id
 WHERE o.status='confirmed' AND o.confirmed_at>=$4 AND o.confirmed_at<$5
 AND ($1::uuid[] IS NULL OR o.customer_id=ANY($1)) AND ($2::uuid[] IS NULL OR l.product_id=ANY($2)) AND ($3::uuid[] IS NULL OR l.warehouse_id=ANY($3)) ORDER BY o.id,l.position LIMIT $6`,values);
 assertBound(sales.rows.length,max);
 const returns=await sql.query<{fact:CommercialFact;id:string;version:string;recorded_at:Date}>(`SELECT jsonb_build_object('kind','return','orderId',o.id,'at',r.confirmed_at,'customerId',o.customer_id,'customerName',c.name,
 'productId',l.product_id,'productName',p.name,'baseUnitName',u.name,'warehouseId',l.warehouse_id,'quantityBase',rl.quantity_base,'amount',rl.return_amount::text,'costAmount',rl.cost_credit_amount::text) AS fact,
 r.id,r.version,r.recorded_at FROM sales_returns r JOIN sales_orders o ON o.id=r.order_id JOIN return_lines rl ON rl.return_id=r.id JOIN revision_lines l ON l.id=rl.source_revision_line_id
 JOIN customers c ON c.id=o.customer_id JOIN products p ON p.id=l.product_id JOIN product_units u ON u.id=p.base_unit_id
 WHERE r.status='confirmed' AND o.status='confirmed' AND r.confirmed_at>=$4 AND r.confirmed_at<$5
 AND ($1::uuid[] IS NULL OR o.customer_id=ANY($1)) AND ($2::uuid[] IS NULL OR l.product_id=ANY($2)) AND ($3::uuid[] IS NULL OR l.warehouse_id=ANY($3)) ORDER BY r.id,rl.id LIMIT $6`,values);
 assertBound(sales.rows.length+returns.rows.length,max);
 return {rows:[...sales.rows,...returns.rows].map(row=>({...row.fact,at:iso(row.fact.at)})),sources:[...sales.rows.map(row=>source('order_revision',row.revision_id,row.created_at,Number(row.revision_no),`/api/v1/orders/${row.order_id}/revisions/${row.revision_id}`)),...returns.rows.map(row=>source('return',row.id,row.recorded_at,Number(row.version)))]};
}
export async function cashSources(sql:Sql,n:NormalizedReport,max:number):Promise<SourceSet<CashFact>>{
 const p=n.currentPeriod!;const result=await sql.query<{data:CashFact;version:string}>(`SELECT jsonb_build_object('eventId',e.id,'customerId',e.customer_id,'customerName',c.name,'kind',e.kind,'amount',e.amount::text,'occurredAt',e.occurred_at,'recordedAt',e.recorded_at,'method',e.method) AS data,e.version
 FROM cash_events e JOIN customers c ON c.id=e.customer_id WHERE e.status='active' AND e.occurred_at>=$1 AND e.occurred_at<$2 AND ($3::uuid[] IS NULL OR e.customer_id=ANY($3)) ORDER BY e.occurred_at,e.id LIMIT $4`,[p.start,p.end,n.query.filters?.customerIds??null,max+1]);
 assertBound(result.rows.length,max);
 const rows=result.rows.map(row=>parseSchema('CashFlowRow',row.data));return {rows,sources:result.rows.map(row=>source('cash_event',row.data.eventId,row.data.recordedAt,Number(row.version)))};
}
export async function lossSources(sql:Sql,n:NormalizedReport,max:number):Promise<SourceSet<SchemaValue<'InventoryLossRow'>>>{
 const p=n.currentPeriod!;const f=n.query.filters;
 const result=await sql.query<{id:string;product_id:string;warehouse_id:string;batch_id:string|null;source_kind:string;source_id:string;return_id:string|null;amount:string;effective_at:Date;recorded_at:Date}>(`SELECT e.*,b.product_id,b.warehouse_id,rl.return_id FROM inventory_loss_entries e LEFT JOIN inventory_batches b ON b.id=e.batch_id LEFT JOIN return_allocations ra ON ra.id=e.source_line_id LEFT JOIN return_lines rl ON rl.id=ra.return_line_id WHERE e.effective_at>=$1 AND e.effective_at<$2
 AND ($3::uuid[] IS NULL OR b.product_id=ANY($3)) AND ($4::uuid[] IS NULL OR b.warehouse_id=ANY($4)) AND ($5::uuid[] IS NULL OR e.batch_id=ANY($5)) ORDER BY e.effective_at,e.id LIMIT $6`,[p.start,p.end,f?.productIds??null,f?.warehouseIds??null,f?.batchIds??null,max+1]);
 assertBound(result.rows.length,max);
 return {rows:result.rows.map(row=>{
  const kinds:Record<string,SchemaValue<'InventoryLossRow'>['kind']>={stocktake_gain:'stocktake_gain',stocktake_loss:'stocktake_loss',return_not_returning:'return_loss',return_loss_restock:'loss_reversal',return_loss_void:'loss_reversal'};
  const kind=kinds[row.source_kind];if(!kind)throw new AppError('UNSUPPORTED_QUERY',422,'存在尚未定义统计口径的库存损益来源');
  return parseSchema('InventoryLossRow',{id:row.id,productId:row.product_id,warehouseId:row.warehouse_id,batchId:row.batch_id,kind,amount:row.amount.replace(/^-/,'') ,effectiveAt:iso(row.effective_at),recordedAt:iso(row.recorded_at)});
 }),sources:result.rows.map(row=>source('loss_entry',row.id,row.recorded_at,null,row.return_id?`/api/v1/returns/${row.return_id}`:`/api/v1/stocktakes/${row.source_id}`))};
}
export async function inventorySources(sql:Sql,n:NormalizedReport,max:number):Promise<SourceSet<SchemaValue<'InventoryRow'>>>{
 const f=n.query.filters;const group=n.query.groupBy!;
 const batch=group.includes('batch'),warehouse=group.includes('warehouse');
 // Group columns come exclusively from this whitelist, never client strings.
 const grouping=batch?'b.id,p.id,u.name,w.id':warehouse?'p.id,u.name,w.id':'p.id,u.name';
 const result=await sql.query<{data:SchemaValue<'InventoryRow'>}>(`SELECT jsonb_build_object('productId',p.id,'productName',p.name,'warehouseId',${warehouse?'w.id':'NULL'},'warehouseName',${warehouse?'w.name':'NULL'},'batchId',${batch?'b.id':'NULL'},'baseUnitName',u.name,'quantityBase',SUM(m.quantity_delta_base),'costAmount',SUM(m.cost_delta_amount)::numeric(20,2)::text,'receivedAt',${batch?'b.received_at':'NULL'},'recordedAt',${batch?'b.recorded_at':'NULL'}) AS data
 FROM stock_movements m JOIN inventory_batches b ON b.id=m.batch_id JOIN products p ON p.id=m.product_id JOIN product_units u ON u.id=p.base_unit_id JOIN warehouses w ON w.id=m.warehouse_id
 WHERE m.recorded_at<=$1 AND ($2::uuid[] IS NULL OR m.product_id=ANY($2)) AND ($3::uuid[] IS NULL OR m.warehouse_id=ANY($3)) AND ($4::uuid[] IS NULL OR m.batch_id=ANY($4)) GROUP BY ${grouping} ORDER BY p.id${warehouse?',w.id':''}${batch?',b.id':''} LIMIT $5`,[n.pointAsOf,f?.productIds??null,f?.warehouseIds??null,f?.batchIds??null,max+1]);
 assertBound(result.rows.length,max);
 const batches=await sql.query<{id:string;product_id:string;warehouse_id:string;recorded_at:Date;version:string}>(`SELECT DISTINCT b.id,b.product_id,b.warehouse_id,b.recorded_at,b.version FROM inventory_batches b JOIN stock_movements m ON m.batch_id=b.id WHERE m.recorded_at<=$1 AND ($2::uuid[] IS NULL OR m.product_id=ANY($2)) AND ($3::uuid[] IS NULL OR m.warehouse_id=ANY($3)) AND ($4::uuid[] IS NULL OR m.batch_id=ANY($4)) ORDER BY b.id LIMIT $5`,[n.pointAsOf,f?.productIds??null,f?.warehouseIds??null,f?.batchIds??null,max+1]);
 assertBound(batches.rows.length,max);
 return {rows:result.rows.map(row=>parseSchema('InventoryRow',row.data)),sources:batches.rows.map(row=>source('batch',row.id,row.recorded_at,Number(row.version),`/api/v1/inventory/batches?productId=${row.product_id}&warehouseId=${row.warehouse_id}#${row.id}`))};
}
export async function balanceSources(sql:Sql,n:NormalizedReport,max:number):Promise<SourceSet<SchemaValue<'CustomerBalanceRow'>>>{
 const result=await sql.query<{id:string;name:string;net:string;version:string;unallocated:string}>(`SELECT c.id,c.name,
 COALESCE((SELECT sum(e.amount_signed) FROM customer_ledger_entries e WHERE e.customer_id=c.id AND e.effective_at<=$1),0)::numeric(20,2)::text AS net,
 (1+(SELECT count(*) FROM customer_ledger_entries e WHERE e.customer_id=c.id AND e.effective_at<=$1))::text AS version,
 COALESCE((SELECT sum(-e.amount_signed-COALESCE((SELECT sum(CASE WHEN a.kind='allocate' THEN a.amount ELSE -a.amount END) FROM settlement_allocations a WHERE a.source_ledger_entry_id=e.id AND a.recorded_at<=$1),0))
 FROM customer_ledger_entries e WHERE e.customer_id=c.id AND e.effective_at<=$1 AND e.kind IN ('receipt','opening') AND e.amount_signed<0
 AND NOT EXISTS(SELECT 1 FROM customer_ledger_entries r WHERE r.reverses_id=e.id AND r.effective_at<=$1)),0)::numeric(20,2)::text AS unallocated
 FROM customers c WHERE ($2::uuid[] IS NULL OR c.id=ANY($2)) ORDER BY c.id LIMIT $3`,[n.pointAsOf,n.query.filters?.customerIds??null,max+1]);
 assertBound(result.rows.length,max);
 const entries=await sql.query<{id:string;customer_id:string;recorded_at:Date;source_version:string|null}>(`SELECT id,customer_id,recorded_at,source_version FROM customer_ledger_entries WHERE effective_at<=$1 AND ($2::uuid[] IS NULL OR customer_id=ANY($2)) ORDER BY id LIMIT $3`,[n.pointAsOf,n.query.filters?.customerIds??null,max+1]);
 assertBound(entries.rows.length,max);
 return {rows:result.rows.map(row=>parseSchema('CustomerBalanceRow',{customerId:row.id,customerName:row.name,netBalance:row.net,receivableBalance:row.net.startsWith('-')?'0.00':row.net,creditBalance:row.net.startsWith('-')?row.net.slice(1):'0.00',unallocatedAmount:row.unallocated,version:Number(row.version),asOf:n.pointAsOf})),sources:entries.rows.map(row=>source('ledger_entry',row.id,row.recorded_at,row.source_version?Number(row.source_version):null,`/api/v1/customers/${row.customer_id}/ledger#${row.id}`))};
}
