import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {parseSchema,ContractValidationError,type SchemaValue} from '@huoyoupu/contracts';
import {AppError} from '../../lib/errors.js';
import {queryReport,getReportSources,type ReportOptions} from '../reporting/service.js';
import {normalizeReportQuery} from '../reporting/query.js';
import type {ModelAdapter} from './model.js';
type Query=SchemaValue<'ReportQuery'>;
type Entity={type:'customer'|'product'|'warehouse'|'batch';term:string};
interface Intent {action:'query'|'clarify'|'unsupported';query:Query|null;entities:Entity[];question:string|null}
interface Pending {intent:Intent;entityIndex:number|null;candidates:{id:string;label:string}[]}
export interface AiOptions {model?:ModelAdapter;timeoutMs?:number;reportOptions?:ReportOptions}
function invalid(message='模型生成了不支持的查询条件'):never{throw new AppError('UNSUPPORTED_QUERY',422,message);}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))invalid();return value as Record<string,unknown>;}
export function validateIntent(value:unknown):Intent{
 const v=object(value);if(Object.keys(v).some(key=>!['action','query','entities','question'].includes(key)))invalid();
 if(!['query','clarify','unsupported'].includes(String(v.action))||!Array.isArray(v.entities)||v.entities.length>20||!(v.question===null||typeof v.question==='string'&&v.question.length<=2000))invalid();
 const entities=v.entities.map((value):Entity=>{const e=object(value);if(Object.keys(e).some(key=>!['type','term'].includes(key))||!['customer','product','warehouse','batch'].includes(String(e.type))||typeof e.term!=='string'||!e.term.trim()||e.term.length>200)invalid();return {type:e.type as Entity['type'],term:e.term.trim()};});
 let query:Query|null=null;
 if(v.query!==null){try{query=structuredClone(parseSchema('ReportQuery',v.query));normalizeReportQuery(query);}catch(error){if(error instanceof ContractValidationError)invalid();throw error;}}
 if(v.action==='query'&&!query||v.action!=='query'&&query!==null)invalid();
 if(query)for(const key of ['customerIds','productIds','warehouseIds','batchIds'] as const)if(query.filters?.[key]!==undefined)invalid('模型必须使用实体候选解析，不能自行指定实体ID');
 if(v.action==='clarify'&&!v.question)invalid();
 return {action:v.action as Intent['action'],query,entities,question:v.question as string|null};
}
export function applyQuestionDefaults(question:string,query:Query):void{
 // Preserve explicit full-month/date requests; a bare "this month" means elapsed MTD.
 if(!['inventory','customer_balances'].includes(query.kind)&&/本月|这个月|本月至今/.test(question)&&!/(完整|自然月|整月|整个月|\d{1,2}月|\d{1,2}[日号]|\d{4}-\d{2}-\d{2})/.test(question))query.period={mode:'mtd_previous'};
}
export function rejectBusinessWrite(question:string):void{
 const deny=()=>invalid('该入口只支持已定义的只读统计，不能执行SQL或业务写入');
 if(/\b(?:select|insert|update|delete|drop|alter|truncate|grant|execute)\b/i.test(question))deny();
 // A statistical verb can govern a modifier ("统计本月新增退款"), but it
 // cannot authorize a later imperative clause ("查询完后增加库存").
 const actions=question.matchAll(/(?:增加|新增|修改|删除|扣减|调整|更新|确认|作废|创建|支付|转账|打款)(?=.{0,30}(?:库存|订单|价格|成本|资金|余额|收款|付款|退款|商品|客户|仓库))/g);
 for(const action of actions){
  const prefix=question.slice(0,action.index).split(/[，,。；;\n]/).at(-1)!;
  const statistical=[...prefix.matchAll(/统计|查询|查看|对比|比较|展示|汇总|分析|列出|计算/g)].at(-1);
  if(!statistical)deny();
  const after=prefix.slice(statistical!.index!+statistical![0].length);
  if(/完(?:了|成|毕)?(?:之)?后|结束(?:之)?后|然后|之后再|再(?:帮|给|把|将|为)?|顺便|并且|同时|并|(?:和|及|以及)\s*$/.test(after))deny();
 }
}
async function timed<T>(timeout:number,work:(signal:AbortSignal)=>Promise<T>):Promise<T>{
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([work(controller.signal),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new AppError('AI_PROVIDER_UNAVAILABLE',503,'模型响应超时，可改用普通报表',undefined,true));},timeout);})]);}
 catch(error){if(error instanceof AppError)throw error;throw new AppError('AI_PROVIDER_UNAVAILABLE',503,'模型暂不可用，可改用普通报表',undefined,true);}
 finally{if(timer)clearTimeout(timer);}
}
async function candidates(pool:Pool,entity:Entity):Promise<{id:string;label:string}[]>{
 let sql:string;
 switch(entity.type){
  case 'customer':sql="SELECT id,code,name FROM customers WHERE id::text=lower($1) OR lower(code)=lower($1) OR strpos(lower(name),lower($1))>0 ORDER BY code,id LIMIT 101";break;
  case 'product':sql="SELECT p.id,p.code,p.name FROM products p WHERE p.id::text=lower($1) OR lower(p.code)=lower($1) OR strpos(lower(p.name),lower($1))>0 OR lower(p.effective_mnemonic)=lower($1) OR EXISTS(SELECT 1 FROM product_barcodes b WHERE b.product_id=p.id AND b.barcode_value=$1) ORDER BY p.code,p.id LIMIT 101";break;
  case 'warehouse':sql="SELECT id,code,name FROM warehouses WHERE id::text=lower($1) OR lower(code)=lower($1) OR strpos(lower(name),lower($1))>0 ORDER BY code,id LIMIT 101";break;
  case 'batch':sql="SELECT b.id,b.id::text AS code,p.name FROM inventory_batches b JOIN products p ON p.id=b.product_id WHERE b.id::text=lower($1) OR starts_with(b.id::text,lower($1)) ORDER BY b.id LIMIT 101";break;
 }
 const rows=(await pool.query<{id:string;code:string;name:string}>(sql,[entity.term])).rows;
 if(rows.length>100)invalid('实体候选过多，请提供更完整名称或编码');
 return rows.map(row=>({id:row.id,label:`[${row.code}] ${row.name}`.slice(0,200)}));
}
const filterKey={customer:'customerIds',product:'productIds',warehouse:'warehouseIds',batch:'batchIds'} as const;
function select(intent:Intent,index:number,id:string){const entity=intent.entities[index]!;const query=intent.query!;query.filters??={};const key=filterKey[entity.type];query.filters[key]=[...(query.filters[key]??[]),id];}
export function canonicalSummary(report:SchemaValue<'ReportResult'>):string{
 let summary=`统计时区Asia/Shanghai，数据视图截止${report.asOf}。`;
 if(report.currentPeriod)summary+=`本期[${report.currentPeriod.start},${report.currentPeriod.end})${report.currentPeriod.incomplete?'（未完结）':''}。`;
 if(report.kind==='customer_product_comparison')summary+=`比较变化口径为${report.normalizedQuery.quantityBasis==='net'?'净销量':'下单量'}。`;
 if(report.baselinePeriod)summary+=`基期[${report.baselinePeriod.start},${report.baselinePeriod.end})。`;
 summary+=`本页${report.rows.length}行${report.nextCursor?'，后续页沿用同一报表ID':''}。`;
 if(!report.rows.length)return summary+'当前筛选与期间没有匹配数据，不表示其他期间或范围也为零。';
 const lines:string[]=[];
 switch(report.kind){
  case 'customer_product_comparison':for(const r of report.rows)lines.push(`${r.customerName??'全部客户'}／${r.productName}：本期下单${r.currentOrderedQuantityBase}${r.baseUnitName}、退货${r.currentReturnQuantityBase}${r.baseUnitName}、净量${r.currentNetQuantityBase}${r.baseUnitName}；基期下单${r.baselineOrderedQuantityBase}${r.baseUnitName}、退货${r.baselineReturnQuantityBase}${r.baseUnitName}、净量${r.baselineNetQuantityBase}${r.baseUnitName}；变化${r.quantityChangeBase}${r.baseUnitName}、比例${r.changePercent===null?'无可比基数':r.changePercent+'%'}；本期净销售额${r.currentNetSalesAmount}元。`);break;
  case 'sales_summary':for(const r of report.rows)lines.push(`销售额${r.grossSalesAmount}元、退货信用${r.returnAmount}元、净销售额${r.netSalesAmount}元、销售成本${r.salesCostAmount}元、原成本信用${r.returnCostCreditAmount}元、毛利${r.grossProfit}元、去重订单${r.orderCount}单；实收${r.receiptAmount===null?'不可按当前维度分摊':r.receiptAmount+'元'}、实退${r.refundAmount===null?'不可按当前维度分摊':r.refundAmount+'元'}。`);break;
  case 'inventory':for(const r of report.rows)lines.push(`${r.productName}／${r.warehouseName??'全部仓库'}：库存${r.quantityBase}${r.baseUnitName}，成本${r.costAmount}元。`);break;
  case 'customer_balances':for(const r of report.rows)lines.push(`${r.customerName}：净往来${r.netBalance}元、应收${r.receivableBalance}元、信用余额${r.creditBalance}元、未分配资金${r.unallocatedAmount}元。`);break;
  case 'cash_flow':for(const r of report.rows)lines.push(`${r.customerName}：${r.kind==='receipt'?'实收':'实退'}${r.amount}元，实际${r.occurredAt}，登记${r.recordedAt}。`);break;
  case 'inventory_loss':for(const r of report.rows)lines.push(`${r.kind}：${r.amount}元，生效${r.effectiveAt}，登记${r.recordedAt}。`);break;
 }
 for(const line of lines.slice(0,5))if(summary.length+line.length<9500)summary+=line;
 return summary+(lines.length>5?'摘要仅列前5行，完整本页数值及后续页请查看结构化报表。':'');
}
export function verifiedSummary(proposal:unknown,canonical:string):string{
 if(!proposal||typeof proposal!=='object'||Array.isArray(proposal))return canonical;const value=proposal as Record<string,unknown>;
 return Object.keys(value).length===1&&value.summary===canonical?value.summary:canonical;
}
async function persist(pool:Pool,actorId:string,question:string,intent:Intent,result:SchemaValue<'AiResult'>,model:string,pending:Pending|null,parent?:string){
 await pool.query(`INSERT INTO ai_query_runs(id,actor_id,question,normalized_intent,report_run_id,status,clarification_snapshot,result_snapshot,model_reference,parent_run_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[result.id,actorId,question,JSON.stringify(intent),result.status==='answered'?result.report.id:null,result.status,pending?JSON.stringify(pending):null,JSON.stringify(result),model.slice(0,200),parent??null]);return result;
}
/** Model waits never hold a business transaction or row lock. */
export async function askAi(pool:Pool,actorId:string,input:unknown,options:AiOptions={}):Promise<SchemaValue<'AiResult'>>{
 const parsed=parseSchema('AiInput',input);rejectBusinessWrite(parsed.question);if(parsed.clarificationAnswer)rejectBusinessWrite(parsed.clarificationAnswer);
 if(!options.model)throw new AppError('AI_PROVIDER_UNAVAILABLE',503,'尚未配置模型服务，可使用普通报表',undefined,true);
 const model=options.model,timeout=options.timeoutMs??15000;if(!Number.isSafeInteger(timeout)||timeout<=0)throw new Error('Invalid AI timeout');
 let intent:Intent;let startIndex=0;let originalQuestion=parsed.question;
 if(parsed.clarificationRunId){
  if(!parsed.clarificationAnswer?.trim())invalid('请提供澄清答案');
  const prior=(await pool.query<{question:string;status:string;clarification_snapshot:Pending}>('SELECT question,status,clarification_snapshot FROM ai_query_runs WHERE id=$1 AND actor_id=$2',[parsed.clarificationRunId,actorId])).rows[0];
  if(!prior)throw new AppError('NOT_FOUND',404,'澄清记录不存在');if(prior.status!=='needs_clarification')invalid('该记录不等待澄清');
  originalQuestion=prior.question;const pending=prior.clarification_snapshot;intent=structuredClone(pending.intent);
  if(pending.entityIndex!==null){
   const match=pending.candidates.filter(choice=>choice.id===parsed.clarificationAnswer||choice.label===parsed.clarificationAnswer);
   if(match.length!==1)invalid('澄清答案必须唯一匹配候选ID或标签');select(intent,pending.entityIndex,match[0]!.id);startIndex=pending.entityIndex+1;
  }else intent=validateIntent(await timed(timeout,signal=>model.plan({question:`${originalQuestion}\n管理员补充：${parsed.clarificationAnswer}`,asOf:new Date().toISOString(),timezone:'Asia/Shanghai'},signal)));
 }else{
  if(parsed.clarificationAnswer!==undefined)invalid('澄清答案必须绑定原澄清记录');
  intent=validateIntent(await timed(timeout,signal=>model.plan({question:parsed.question,asOf:new Date().toISOString(),timezone:'Asia/Shanghai'},signal)));
 }
 if(intent.action==='unsupported')invalid('该入口只支持已定义的只读统计，请使用普通业务页面执行其他操作');
 const clarify=async(question:string,choices:{id:string;label:string}[],entityIndex:number|null)=>{
  const result=parseSchema('AiClarification',{status:'needs_clarification',id:randomUUID(),question,choices});return persist(pool,actorId,originalQuestion,intent,result,model.reference,{intent,entityIndex,candidates:choices},parsed.clarificationRunId);
 };
 if(intent.action==='clarify')return clarify(intent.question!,[],null);
 for(let i=startIndex;i<intent.entities.length;i++){
  const entity=intent.entities[i]!,matches=await candidates(pool,entity);
  if(matches.length!==1)return clarify(matches.length?`“${entity.term}”匹配多个实体，请选择明确候选。`:`没有匹配“${entity.term}”的实体，请补充名称或编码。`,matches,matches.length?i:null);
  select(intent,i,matches[0]!.id);
 }
 applyQuestionDefaults(`${originalQuestion} ${parsed.clarificationAnswer??''}`,intent.query!);normalizeReportQuery(intent.query);const report=await queryReport(pool,actorId,intent.query,options.reportOptions);const canonical=canonicalSummary(report);
 let summary=canonical;
 if(model.explain){try{summary=verifiedSummary(await timed(timeout,signal=>model.explain!({report,canonicalSummary:canonical},signal)),canonical);}catch{summary=canonical;}}
 const evidence:SchemaValue<'SourceRef'>[]=[];let cursor:string|undefined;
 do{const page=await getReportSources(pool,report.id,{...(cursor?{cursor}:{}),limit:200});evidence.push(...page.items);cursor=page.nextCursor??undefined;}while(cursor&&evidence.length<1000);
 if(cursor)summary+='回答附前1000条来源，完整来源沿同一报表ID分页读取。';
 const result=parseSchema('AiAnswer',{status:'answered',id:randomUUID(),summary,query:report.normalizedQuery,report,evidence});
 return persist(pool,actorId,originalQuestion,intent,result,model.reference,null,parsed.clarificationRunId);
}
