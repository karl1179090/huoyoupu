import {parseSchema,type SchemaValue} from '@huoyoupu/contracts';
import {AppError} from '../../lib/errors.js';
export type ReportQuery=SchemaValue<'ReportQuery'>;
export interface Period {start:string;end:string}
export interface NormalizedReport {
 query:ReportQuery;asOf:string;pointAsOf:string|null;
 currentPeriod:(Period&{incomplete:boolean})|null;baselinePeriod:Period|null;
}
const zone='Asia/Shanghai';
const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export function shanghaiParts(date:Date){
 const parts=Object.fromEntries(formatter.formatToParts(date).map(part=>[part.type,part.value]));
 return {year:Number(parts.year),month:Number(parts.month),day:Number(parts.day),hour:Number(parts.hour),minute:Number(parts.minute),second:Number(parts.second),millisecond:date.getUTCMilliseconds()};
}
/** Resolve a Shanghai wall clock using Intl's actual offset, independent of host TZ. */
export function shanghaiInstant(year:number,month:number,day=1,hour=0,minute=0,second=0,millisecond=0):Date{
 const target=Date.UTC(year,month-1,day,hour,minute,second,millisecond);let result=new Date(target);
 for(let i=0;i<4;i++){
  const p=shanghaiParts(result);const wall=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second,p.millisecond);
  const delta=target-wall;if(!delta)return result;result=new Date(result.getTime()+delta);
 }
 throw new AppError('UNSUPPORTED_QUERY',422,'业务时区存在不能解析的时间');
}
function unsupported(message:string):never{throw new AppError('UNSUPPORTED_QUERY',422,message);}
function instant(value:string):string{
 const date=new Date(value);if(!Number.isFinite(date.getTime()))unsupported('时间超出可查询范围');return date.toISOString();
}
function period(start:string,end:string):Period{
 const result={start:instant(start),end:instant(end)};
 if(result.start>result.end)unsupported('期间必须满足开始早于结束');return result;
}
const groupings:Record<ReportQuery['kind'],string[][]>={sales_summary:[[],['day'],['month']],customer_product_comparison:[['customer','product'],['product']],inventory:[['product','warehouse','batch'],['product','warehouse'],['product']],customer_balances:[['customer']],cash_flow:[[]],inventory_loss:[[]]};
const filters:Record<ReportQuery['kind'],string[]>={sales_summary:['customerIds','productIds','warehouseIds'],customer_product_comparison:['customerIds','productIds','warehouseIds','decreasesOnly','minDecreaseQuantityBase','minDecreasePercent'],inventory:['productIds','warehouseIds','batchIds'],customer_balances:['customerIds'],cash_flow:['customerIds'],inventory_loss:['productIds','warehouseIds','batchIds']};
function monthBoundary(value:string):boolean{const p=shanghaiParts(new Date(value));return p.day===1&&p.hour===0&&p.minute===0&&p.second===0&&p.millisecond===0;}
function singleMonth(value:Period):boolean{const p=shanghaiParts(new Date(value.start));return monthBoundary(value.start)&&monthBoundary(value.end)&&shanghaiInstant(p.year,p.month+1).toISOString()===value.end;}

export function normalizeReportQuery(input:unknown,at=new Date()):NormalizedReport{
 const raw=parseSchema('ReportQuery',input);const asOf=at.toISOString();
 const grouping=raw.groupBy??groupings[raw.kind][0]!;
 const signature=[...grouping].sort().join(',');
 if(!groupings[raw.kind].some(value=>[...value].sort().join(',')===signature))unsupported('该报表不支持所选分组');
 const selected:NonNullable<ReportQuery['filters']>={};
 for(const [key,value]of Object.entries(raw.filters??{})){
  if(!filters[raw.kind].includes(key))unsupported(`该报表不支持过滤参数 ${key}`);
  Object.assign(selected,{[key]:Array.isArray(value)?[...new Set(value.map(id=>id.toLowerCase()))].sort():value});
 }
 const query:ReportQuery={kind:raw.kind,groupBy:groupings[raw.kind].find(value=>[...value].sort().join(',')===signature)! as NonNullable<ReportQuery['groupBy']>,filters:selected,limit:raw.limit??50};
 const point=['inventory','customer_balances'].includes(raw.kind);
 if(raw.quantityBasis!==undefined&&raw.kind!=='customer_product_comparison')unsupported('数量口径只适用于客户商品比较');
 if(point){
  if(raw.period!==undefined)unsupported('截止时点报表不接受期间参数');
  const pointAsOf=raw.pointAsOf?instant(raw.pointAsOf):asOf;
  if(pointAsOf>asOf)unsupported('截止时点不能在未来');
  query.pointAsOf=pointAsOf;return {query,asOf,pointAsOf,currentPeriod:null,baselinePeriod:null};
 }
 if(raw.pointAsOf!==undefined)unsupported('期间发生额报表不接受截止时点参数');
 const comparison=raw.kind==='customer_product_comparison';
 if(comparison)query.quantityBasis=raw.quantityBasis??'ordered';
 const requested=raw.period??{mode:'mtd_previous'};let current:Period;let baseline:Period|null=null;
 if(requested.mode==='mtd_previous'){
  if(Object.keys(requested).some(key=>key!=='mode'))unsupported('同期模式由系统推导日期，不接受显式日期');
  const p=shanghaiParts(at);const start=shanghaiInstant(p.year,p.month);const previous=shanghaiParts(new Date(start.getTime()-1));
  const baselineStart=shanghaiInstant(previous.year,previous.month);
  // A shorter previous month ends at its exclusive month boundary, including its last day.
  const baselineEnd=p.day>previous.day?start:shanghaiInstant(previous.year,previous.month,p.day,p.hour,p.minute,p.second,p.millisecond);
  current={start:start.toISOString(),end:asOf};
  if(comparison)baseline={start:baselineStart.toISOString(),end:baselineEnd.toISOString()};
 }else{
  if(!requested.start||!requested.end)unsupported('期间必须提供开始和结束');
  current=period(requested.start,requested.end);
  if(requested.mode==='calendar_months'&&!singleMonth(current))unsupported('自然月区间必须是上海月初至下月月初');
  const hasBaseline=requested.baselineStart!==undefined||requested.baselineEnd!==undefined;
  if(hasBaseline&&!comparison)unsupported('该报表不使用比较基期');
  if(comparison){
   if(hasBaseline){
    if(!requested.baselineStart||!requested.baselineEnd)unsupported('比较基期必须提供完整开始和结束');
    baseline=period(requested.baselineStart,requested.baselineEnd);
    if(requested.mode==='calendar_months'&&!singleMonth(baseline))unsupported('自然月基期必须是上海月初至下月月初');
   }else if(requested.mode==='custom')unsupported('自定义比较必须提供基期');
   else{const p=shanghaiParts(new Date(current.start));baseline=period(shanghaiInstant(p.year,p.month-1).toISOString(),current.start);}
  }
 }
 const p=shanghaiParts(at);const monthStart=shanghaiInstant(p.year,p.month).getTime();const nextMonth=shanghaiInstant(p.year,p.month+1).getTime();
 const incomplete=new Date(current.start).getTime()<nextMonth&&new Date(current.end).getTime()>at.getTime()||new Date(current.start).getTime()>=monthStart&&new Date(current.end).getTime()<=at.getTime();
 // Persist canonical explicit intervals so the normalized query can itself be replayed.
 query.period={mode:'custom',...current,...(baseline?{baselineStart:baseline.start,baselineEnd:baseline.end}:{})};
 return {query,asOf,pointAsOf:null,currentPeriod:{...current,incomplete},baselinePeriod:baseline};
}
