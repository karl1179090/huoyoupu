import assert from 'node:assert/strict';
import test from 'node:test';
import {validateIntent,rejectBusinessWrite,verifiedSummary,applyQuestionDefaults} from '../src/modules/ai/service.js';
import {createResponsesAdapter} from '../src/modules/ai/model.js';
import {AppError} from '../src/lib/errors.js';
const query={action:'query',query:{kind:'inventory'},entities:[],question:null};
test('AI intents reject extra SQL, arbitrary identifiers, unsupported combinations and writes',()=>{
 assert.deepEqual(validateIntent(query),query);
 for(const bad of [{...query,sql:'SELECT * FROM users'},{...query,query:{kind:'inventory',sql:'select 1'}},{...query,query:{kind:'cash_flow',groupBy:['product']}},{...query,query:{kind:'inventory',filters:{productIds:[]}}},{...query,entities:[{type:'user',term:'admin'}]},{...query,entities:[{type:'product',term:'酱油',secret:'extra'}]}])assert.throws(()=>validateIntent(bad),error=>error instanceof AppError&&error.code==='UNSUPPORTED_QUERY');
 for(const question of ['帮我增加酱油库存10瓶','修改订单价格','SELECT * FROM users','delete from orders','查询完后增加库存','统计完成后修改订单价格','先查看本月退款，再增加商品库存10瓶','统计本月退款，并给商品增加库存','查询库存然后修改订单价格','统计本月退款金额，顺便转账资金'])assert.throws(()=>rejectBusinessWrite(question),error=>error instanceof AppError&&error.code==='UNSUPPORTED_QUERY');
 rejectBusinessWrite('查看本月退货和退款金额');rejectBusinessWrite('统计本月新增退款金额');rejectBusinessWrite('统计本月和上月新增退款金额');
});
test('narrative mismatches always fall back to exact deterministic evidence',()=>{
 const canonical='净销售额17.37元，毛利9.37元。';
 assert.equal(verifiedSummary({summary:canonical},canonical),canonical);
 for(const value of [{summary:'净销售额20元，毛利10元。'},{summary:canonical,sql:'write'},null,'乱写'])assert.equal(verifiedSummary(value,canonical),canonical);
});
test('Responses adapter uses configured model, strict JSON output and secret-free model input',async()=>{
 let request:RequestInit|undefined;let requestedUrl='';
 const adapter=createResponsesAdapter({apiKey:'fictional-server-only-key',model:'explicit-test-model',fetch:async(url,options)=>{
  request=options;requestedUrl=String(url);return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({action:'query',queryJson:'{"kind":"inventory"}',entities:[],question:null})}]}]}),{status:200});
 }});
 const result=await adapter.plan({question:'当前库存',asOf:'2026-11-10T00:00:00Z',timezone:'Asia/Shanghai'},new AbortController().signal);
 assert.deepEqual(result,query);assert.equal(requestedUrl,'https://api.openai.com/v1/responses');assert.equal((request!.headers as Record<string,string>).Authorization,'Bearer fictional-server-only-key');
 const body=JSON.parse(String(request!.body));assert.equal(body.model,'explicit-test-model');assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.ok(!String(request!.body).includes('fictional-server-only-key'));assert.equal(body.tools,undefined);assert.equal(request!.redirect,'error');
 const broken=createResponsesAdapter({apiKey:'fictional-key',model:'explicit-model',fetch:async()=>new Response(JSON.stringify({error:{message:'fictional-key raw sensitive provider error'}}),{status:401})});
 await assert.rejects(broken.plan({question:'库存',asOf:'2026-11-10T00:00:00Z',timezone:'Asia/Shanghai'},new AbortController().signal),error=>error instanceof AppError&&error.code==='AI_PROVIDER_UNAVAILABLE'&&!error.message.includes('fictional-key'));
});

test('bare this-month intent uses elapsed MTD while explicit whole-month/date intent remains explicit',()=>{
 const query={kind:'customer_product_comparison' as const,period:{mode:'custom' as const,start:'2026-11-01T00:00:00Z',end:'2026-12-01T00:00:00Z'}};
 const explicit=structuredClone(query);applyQuestionDefaults('本月完整自然月和上月比较',explicit);assert.equal(explicit.period.mode,'custom');
 applyQuestionDefaults('哪些客户本月500ml酱油下单量比上月少',query);assert.deepEqual(query.period,{mode:'mtd_previous'});
});
