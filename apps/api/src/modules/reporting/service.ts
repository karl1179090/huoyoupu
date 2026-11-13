import {createHash,randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {withTransaction} from '@huoyoupu/database';
import {parseSchema,type SchemaValue} from '@huoyoupu/contracts';
import {AppError} from '../../lib/errors.js';
import {normalizeReportQuery,type NormalizedReport} from './query.js';
import {compareProducts,summarizeSales} from './metrics.js';
import {commercialSources,cashSources,inventorySources,lossSources,balanceSources,iso,type SourceRef,type Sql} from './sources.js';
export interface ReportOptions {retentionMs?:number;maxSourceRows?:number;timeoutMs?:number}
type ReportResult=SchemaValue<'ReportResult'>;
type ReportRow=ReportResult['rows'][number];
interface StoredRun {id:string;kind:ReportResult['kind'];normalized_query:NormalizedReport['query'];as_of:Date;generated_at:Date;source_watermark:string;current_period:ReportResult['currentPeriod'];baseline_period:ReportResult['baselinePeriod'];rows_snapshot:ReportRow[];source_manifest:SourceRef[];expires_at:Date}
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function pagination(id:string,view:'rows'|'sources',size:number,cursor?:string,limit=50){
 if(!Number.isSafeInteger(limit)||limit<1||limit>200)throw new AppError('INVALID_REQUEST',400,'分页数量无效');
 let offset=0;
 if(cursor){try{
  const parsed=JSON.parse(Buffer.from(cursor,'base64url').toString()) as {id:unknown;view:unknown;offset:unknown};
  if(parsed.id!==id||parsed.view!==view||!Number.isSafeInteger(parsed.offset)||Number(parsed.offset)<0||Number(parsed.offset)>size)throw new Error();offset=Number(parsed.offset);
 }catch{throw new AppError('INVALID_REQUEST',400,'分页游标无效或不属于本快照');}}
 return {offset,limit,nextCursor:offset+limit<size?Buffer.from(JSON.stringify({id,view,offset:offset+limit})).toString('base64url'):null};
}
async function stored(sql:Sql,id:string):Promise<StoredRun>{
 const row=(await sql.query<StoredRun>('SELECT * FROM report_runs WHERE id=$1',[id])).rows[0];
 if(!row)throw new AppError('NOT_FOUND',404,'报表快照不存在');
 if(row.expires_at.getTime()<=Date.now())throw new AppError('SNAPSHOT_EXPIRED',410,'报表快照已过保留期，请重新查询');return row;
}
export async function getReportRun(sql:Sql,id:string,query:{cursor?:string;limit?:number}={}):Promise<ReportResult>{
 const row=await stored(sql,id);const page=pagination(id,'rows',row.rows_snapshot.length,query.cursor,query.limit??row.normalized_query.limit??50);
 return parseSchema('ReportResult',{id,kind:row.kind,normalizedQuery:row.normalized_query,asOf:iso(row.as_of),generatedAt:iso(row.generated_at),sourceWatermark:row.source_watermark,timezone:'Asia/Shanghai',currentPeriod:row.current_period,baselinePeriod:row.baseline_period,nextCursor:page.nextCursor,rows:row.rows_snapshot.slice(page.offset,page.offset+page.limit)});
}
export async function getReportSources(sql:Sql,id:string,query:{cursor?:string;limit?:number}={}):Promise<SchemaValue<'SourcePage'>>{
 const row=await stored(sql,id);const page=pagination(id,'sources',row.source_manifest.length,query.cursor,query.limit);
 return parseSchema('SourcePage',{items:row.source_manifest.slice(page.offset,page.offset+page.limit),nextCursor:page.nextCursor,asOf:iso(row.as_of)});
}
async function execute(client:PoolClient,n:NormalizedReport,max:number):Promise<{rows:ReportRow[];sources:SourceRef[]}>{
 switch(n.query.kind){
  case 'sales_summary':{
   const facts=await commercialSources(client,n,max);const f=n.query.filters;const cash=f?.productIds!==undefined||f?.warehouseIds!==undefined?{rows:[],sources:[]}:await cashSources(client,n,max);return {rows:summarizeSales(n,facts.rows,cash.rows),sources:[...facts.sources,...cash.sources]};
  }
  case 'customer_product_comparison':{const facts=await commercialSources(client,n,max);return {rows:compareProducts(n,facts.rows),sources:facts.sources};}
  case 'inventory':return inventorySources(client,n,max);
  case 'inventory_loss':return lossSources(client,n,max);
  case 'cash_flow':return cashSources(client,n,max);
  case 'customer_balances':return balanceSources(client,n,max);
 }
}
/** Call with a fresh transaction: snapshots must never span multiple data views. */
export async function queryReport(pool:Pool,actorId:string,input:unknown,options:ReportOptions={}):Promise<ReportResult>{
 const max=options.maxSourceRows??100000,retention=options.retentionMs??30*24*60*60*1000,timeout=options.timeoutMs??15000;
 if(!Number.isSafeInteger(max)||max<1||!Number.isSafeInteger(retention)||retention<=0||!Number.isSafeInteger(timeout)||timeout<1)throw new Error('Invalid report configuration');
 try{return await withTransaction(pool,async client=>{
  await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await client.query("SELECT set_config('statement_timeout',$1,true)",[String(timeout)]);
  const time=(await client.query<{at:Date}>('SELECT clock_timestamp() AS at')).rows[0]!.at;
  const n=normalizeReportQuery(input,time);const result=await execute(client,n,max);
  const sources=[...new Map(result.sources.map(value=>[`${value.entityType}:${value.id}:${value.version}`,value])).values()].sort((a,b)=>a.entityType.localeCompare(b.entityType)||a.id.localeCompare(b.id));
  const id=randomUUID(),watermark=digest({sources,rows:result.rows}),generatedAt=new Date();
  await client.query(`INSERT INTO report_runs(id,kind,query_hash,normalized_query,as_of,generated_at,source_watermark,current_period,baseline_period,rows_snapshot,source_manifest,created_by,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[id,n.query.kind,digest(n.query),JSON.stringify(n.query),n.asOf,generatedAt,watermark,n.currentPeriod?JSON.stringify(n.currentPeriod):null,n.baselinePeriod?JSON.stringify(n.baselinePeriod):null,JSON.stringify(result.rows),JSON.stringify(sources),actorId,new Date(generatedAt.getTime()+retention)]);
  return getReportRun(client,id);
 });}catch(error){
  if(error&&typeof error==='object'&&'code'in error&&error.code==='57014')throw new AppError('QUERY_TIMEOUT',503,'统计查询超时，请缩小范围',undefined,true);
  if(error instanceof RangeError)throw new AppError('UNSUPPORTED_QUERY',422,'统计合计超过精度范围');throw error;
 }
}
