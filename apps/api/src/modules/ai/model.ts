import {AppError} from '../../lib/errors.js';
import {openapiDocument,type SchemaValue} from '@huoyoupu/contracts';
export interface ModelInput {question:string;asOf:string;timezone:'Asia/Shanghai'}
export interface ModelAdapter {
 readonly reference:string;
 plan(input:ModelInput,signal:AbortSignal):Promise<unknown>;
 explain?(input:{report:SchemaValue<'ReportResult'>;canonicalSummary:string},signal:AbortSignal):Promise<unknown>;
}
export interface ResponsesConfig {apiKey:string;model:string;endpoint?:string;fetch?:typeof globalThis.fetch;maxOutputTokens?:number}
const entitySchema={type:'object',properties:{type:{type:'string',enum:['customer','product','warehouse','batch']},term:{type:'string'}},required:['type','term'],additionalProperties:false};
const planSchema={type:'object',properties:{action:{type:'string',enum:['query','clarify','unsupported']},queryJson:{type:['string','null']},entities:{type:'array',items:entitySchema},question:{type:['string','null']}},required:['action','queryJson','entities','question'],additionalProperties:false};
/** Native fetch only; no provider SDK or database credential enters model inputs. */
export function createResponsesAdapter(config:ResponsesConfig):ModelAdapter{
 if(!config.apiKey||!config.model)throw new Error('AI API key and explicit model are required');
 const endpoint=new URL(config.endpoint??'https://api.openai.com/v1/responses');
 if(endpoint.protocol!=='https:'&&!(endpoint.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname)))throw new Error('AI endpoint must use HTTPS');
 const request=config.fetch??globalThis.fetch;
 async function generate(instructions:string,input:unknown,schema:unknown,signal:AbortSignal):Promise<unknown>{
  try{
   const response=await request(endpoint,{method:'POST',signal,redirect:'error',headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:config.model,store:false,instructions,input:JSON.stringify(input),max_output_tokens:config.maxOutputTokens??6000,text:{format:{type:'json_schema',name:'inventory_readonly_result',strict:true,schema}}})});
   if(!response.ok)throw new Error('provider unavailable');
   // Do not log provider error bodies, prompts, headers, or model output.
   const reader=response.body?.getReader();if(!reader)throw new Error('missing provider body');
   const decoder=new TextDecoder();let body='',bytes=0;
   try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>256000){await reader.cancel();throw new Error('provider response too large');}body+=decoder.decode(part.value,{stream:true});}body+=decoder.decode();}finally{reader.releaseLock();}
   const envelope=JSON.parse(body) as {status?:string;output?:{type?:string;content?:{type?:string;text?:string}[]}[]};
   if(envelope.status!=='completed'||!Array.isArray(envelope.output))throw new Error('incomplete provider response');
   const content=envelope.output.filter(item=>item.type==='message').flatMap(item=>item.content??[]);if(content.some(part=>part.type==='refusal'))throw new Error('provider refusal');
   const text=content.filter(part=>part.type==='output_text').map(part=>part.text??'').join('');if(!text)throw new Error('missing structured result');return JSON.parse(text) as unknown;
  }catch{throw new AppError('AI_PROVIDER_UNAVAILABLE',503,'模型暂不可用，可改用普通报表',undefined,true);}
 }
 return {
  reference:config.model.slice(0,200),
  async plan(input,signal){
   const instructions=`你只将管理员中文经营问题转为受控只读报表意图。绝不生成或执行SQL、业务写入、工具调用。业务时区Asia/Shanghai；本月比较默认mtd_previous/ordered，包含本期零购买组合，退货单列。用户要求完整月才calendar_months；明确日期才custom。queryJson仅为ReportQuery的JSON文本，无SQL和其他字段；实体名称/简称/编码放entities，禁止自行填entity ID过滤。实体必须由后端候选解析，不能猜测UUID。含歧义期间请action=clarify并给问题，无可执行query时queryJson=null。写操作/任意SQL及白名单外能力action=unsupported。分组过滤按该类型允许组合，不将不同商品基础单位相加。ReportQuery schema=${JSON.stringify(openapiDocument.components.schemas.ReportQuery)}。ReportPeriod=${JSON.stringify(openapiDocument.components.schemas.ReportPeriod)}。ReportFilters=${JSON.stringify(openapiDocument.components.schemas.ReportFilters)}。Id是UUID，Quantity是安全非负整数。entities.type只能customer/product/warehouse/batch，term是原问题中的相应实体文字。`;
   const output=await generate(instructions,input,planSchema,signal);
   if(!output||typeof output!=='object')return output;
   const value=output as Record<string,unknown>;
   if(Object.keys(value).length!==4||Object.keys(value).some(key=>!['action','queryJson','entities','question'].includes(key))||!(value.queryJson===null||typeof value.queryJson==='string'))throw new AppError('AI_PROVIDER_UNAVAILABLE',503,'模型查询格式不合法，可改用普通报表',undefined,true);
   let query:unknown=null;if(typeof value.queryJson==='string'){try{query=JSON.parse(value.queryJson) as unknown;}catch{throw new AppError('AI_PROVIDER_UNAVAILABLE',503,'模型查询格式不合法，可改用普通报表',undefined,true);}}
   return {action:value.action,query,entities:value.entities,question:value.question};
  },
  async explain(input,signal){
   return generate('核对报表证据与canonicalSummary。只在证据支持时逐字返回canonicalSummary，不扩充、推算或改写数值和单位；不支持时返回空summary。',{report:input.report,canonicalSummary:input.canonicalSummary},{type:'object',properties:{summary:{type:'string'}},required:['summary'],additionalProperties:false},signal);
  },
 };
}
