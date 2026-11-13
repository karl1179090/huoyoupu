import {formatMoney,parseMoney,roundHalfUp,MAX_SAFE_QUANTITY} from '@huoyoupu/money';
import type {SchemaValue} from '@huoyoupu/contracts';
import {AppError} from '../../lib/errors.js';
import {shanghaiParts,shanghaiInstant,type NormalizedReport,type Period} from './query.js';
export interface CommercialFact {
 kind:'sale'|'return';orderId:string;at:string;customerId:string;customerName:string;
 productId:string;productName:string;baseUnitName:string;warehouseId:string;quantityBase:number;amount:string;costAmount:string;
}
export type CashFact=SchemaValue<'CashFlowRow'>;
function inPeriod(at:string,period:Period):boolean{return Date.parse(at)>=Date.parse(period.start)&&Date.parse(at)<Date.parse(period.end);}
export function safeCount(value:bigint,signed=false):number{
 if(value>MAX_SAFE_QUANTITY||value<(signed?-MAX_SAFE_QUANTITY:0n))throw new AppError('UNSUPPORTED_QUERY',422,'统计数量超出安全整数范围');return Number(value);
}
export function summarizeSales(normalized:NormalizedReport,facts:CommercialFact[],cash:CashFact[]):SchemaValue<'SalesSummaryRow'>[]{
 const current=normalized.currentPeriod!;const group=normalized.query.groupBy?.[0];
 const periods:Period[]=[];
 if(!group)periods.push(current);
 else{
  let cursor=new Date(current.start);const p=shanghaiParts(cursor);
  cursor=shanghaiInstant(p.year,p.month,group==='day'?p.day:1);
  while(cursor.getTime()<Date.parse(current.end)){
   const p=shanghaiParts(cursor);const next=shanghaiInstant(p.year,group==='day'?p.month:p.month+1,group==='day'?p.day+1:1);
   periods.push({start:new Date(Math.max(cursor.getTime(),Date.parse(current.start))).toISOString(),end:new Date(Math.min(next.getTime(),Date.parse(current.end))).toISOString()});cursor=next;
   if(periods.length>10000)throw new AppError('UNSUPPORTED_QUERY',422,'期间分组过多，请缩小查询范围');
  }
 }
 return periods.map(period=>{
  const selected=facts.filter(fact=>inPeriod(fact.at,period));let sales=0n,returns=0n,cost=0n,credits=0n;const orders=new Set<string>();
  for(const fact of selected){if(fact.kind==='sale'){sales+=parseMoney(fact.amount);cost+=parseMoney(fact.costAmount);orders.add(fact.orderId);}else{returns+=parseMoney(fact.amount);credits+=parseMoney(fact.costAmount);}}
  const filter=normalized.query.filters;const cashApplicable=filter?.productIds===undefined&&filter?.warehouseIds===undefined;
  const cashSum=(kind:CashFact['kind'])=>formatMoney(cash.filter(fact=>fact.kind===kind&&inPeriod(fact.occurredAt,period)).reduce((sum,fact)=>sum+parseMoney(fact.amount),0n));
  return {periodStart:period.start,periodEnd:period.end,grossSalesAmount:formatMoney(sales),returnAmount:formatMoney(returns),netSalesAmount:formatMoney(sales-returns),salesCostAmount:formatMoney(cost),returnCostCreditAmount:formatMoney(credits),grossProfit:formatMoney(sales-returns-cost+credits),orderCount:safeCount(BigInt(orders.size)),receiptAmount:cashApplicable?cashSum('receipt'):null,refundAmount:cashApplicable?cashSum('refund'):null};
 });
}
export function compareProducts(normalized:NormalizedReport,facts:CommercialFact[]):SchemaValue<'CustomerProductRow'>[]{
 type Counters={ordered:bigint;returned:bigint;amount:bigint};
 const empty=():Counters=>({ordered:0n,returned:0n,amount:0n});
 const grouped=new Map<string,{fact:CommercialFact;current:Counters;baseline:Counters}>();
 const customer=normalized.query.groupBy!.includes('customer');
 for(const fact of facts){
  const sides=(['current','baseline'] as const).filter(side=>inPeriod(fact.at,side==='current'?normalized.currentPeriod!:normalized.baselinePeriod!));if(!sides.length)continue;
  const key=JSON.stringify([customer?fact.customerId:null,fact.productId]);let row=grouped.get(key);
  if(!row){row={fact,current:empty(),baseline:empty()};grouped.set(key,row);}
  for(const side of sides){const values=row[side];const quantity=BigInt(fact.quantityBase);
  if(fact.kind==='sale'){values.ordered+=quantity;values.amount+=parseMoney(fact.amount);}else{values.returned+=quantity;values.amount-=parseMoney(fact.amount);}}
 }
 const rows=[...grouped.values()].map(({fact,current,baseline}):SchemaValue<'CustomerProductRow'>=>{
  const net=normalized.query.quantityBasis==='net';const a=net?current.ordered-current.returned:current.ordered,b=net?baseline.ordered-baseline.returned:baseline.ordered;const change=a-b;
  const percent=b>0n?formatMoney((change<0n?-1n:1n)*roundHalfUp((change<0n?-change:change)*10000n,b)):null;
  const trend=b<=0n?(b===0n&&a>0n?'new':'no_baseline'):change<0n?'decreased':change>0n?'increased':'unchanged';
  return {customerId:customer?fact.customerId:null,customerName:customer?fact.customerName:null,productId:fact.productId,productName:fact.productName,baseUnitName:fact.baseUnitName,currentOrderedQuantityBase:safeCount(current.ordered),baselineOrderedQuantityBase:safeCount(baseline.ordered),currentReturnQuantityBase:safeCount(current.returned),baselineReturnQuantityBase:safeCount(baseline.returned),currentNetQuantityBase:safeCount(current.ordered-current.returned,true),baselineNetQuantityBase:safeCount(baseline.ordered-baseline.returned,true),quantityChangeBase:safeCount(change,true),changePercent:percent,trend,currentNetSalesAmount:formatMoney(current.amount),baselineNetSalesAmount:formatMoney(baseline.amount)};
 });
 const filter=normalized.query.filters;
 return rows.filter(row=>{
  if(filter?.decreasesOnly&&row.quantityChangeBase>=0)return false;
  if(filter?.minDecreaseQuantityBase!==undefined&&-row.quantityChangeBase<filter.minDecreaseQuantityBase)return false;
  if(filter?.minDecreasePercent!==undefined){
   const raw=filter.minDecreasePercent;const threshold=parseMoney(raw.includes('.')?raw.split('.')[0]+'.'+raw.split('.')[1]!.padEnd(2,'0'):raw+'.00');
   const baseline=BigInt(normalized.query.quantityBasis==='net'?row.baselineNetQuantityBase:row.baselineOrderedQuantityBase);
   // Filter the original ratio, never its rounded display percentage.
   if(baseline<=0n||-BigInt(row.quantityChangeBase)*10000n<threshold*baseline)return false;
  }
  return true;
 }).sort((a,b)=>(a.customerId??'').localeCompare(b.customerId??'')||a.productId.localeCompare(b.productId));
}
