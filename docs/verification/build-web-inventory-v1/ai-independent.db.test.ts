import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {parseSchema} from '../../../packages/contracts/src/index.js';
import {apiFixture,password,writeHeaders} from '../../../apps/api/test/helpers.js';
import {createResponsesAdapter} from '../../../apps/api/src/modules/ai/model.js';

async function provider(){
 const key='fictional-independent-ai-key';let mode:'valid'|'sql'|'ids'|'error'|'delay'|'explain_delay'|'direction'='valid';const payloads:string[]=[];const timers:NodeJS.Timeout[]=[];let calls=0;
 const server=createServer(async(req,res)=>{calls++;let body='';for await(const chunk of req)body+=String(chunk);assert.equal(req.headers.authorization,`Bearer ${key}`);payloads.push(body);const input=JSON.parse(body);const explaining=!!input.text?.format?.schema?.properties?.summary;
  if(mode==='error'){res.writeHead(503);res.end(key);return;}
  if(mode==='delay'||mode==='explain_delay'&&explaining){timers.push(setTimeout(()=>res.end('{}'),200));return;}
  const query=mode==='sql'?{kind:'customer_balances',sql:'DROP TABLE customers'}:mode==='ids'?{kind:'customer_balances',filters:{customerIds:['11111111-1111-4111-8111-111111111111']}}:{kind:'customer_balances'};
  const result=explaining?{summary:mode==='direction'?JSON.parse(input.input).canonicalSummary.replace('应收','可退款'):'故意错误：净往来999999.99，所有客户都没有欠款'}:{action:'query',queryJson:JSON.stringify(query),entities:[{type:'customer',term:'华联'}],question:null};
  res.setHeader('content-type','application/json');res.end(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}]}));
 });await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 return{key,payloads,get calls(){return calls;},setMode(value:typeof mode){mode=value;},model:createResponsesAdapter({apiKey:key,model:'independent-http-fixture',endpoint:`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/responses`}),close:async()=>{timers.forEach(clearTimeout);server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}

test('independent AI real transport: candidate binding, evidence snapshots, exact fallback and no unauthorized model/write paths',async()=>{
 const remote=await provider();const f=await apiFixture({ai:{model:remote.model,timeoutMs:60}});
 try{
  const admin=await f.login();const write=async(url:string,payload:unknown,status=201)=>{const r=await f.app.inject({method:'POST',url,headers:writeHeaders(admin),payload});assert.equal(r.statusCode,status,r.body);return r.json();};
  const a=await write('/api/v1/customers',{code:'AIA',name:'华联东店'});const b=await write('/api/v1/customers',{code:'AIB',name:'华联西店'});await write(`/api/v1/customers/${a.id}/addresses`,{contactName:'不应发送模型的联系人',phone:'13500000000',address:'不应发送模型的地址',isDefault:true});
  await write(`/api/v1/customers/${a.id}/opening-balance`,{amount:'12.34',effectiveAt:'2026-01-01T00:00:00Z',reason:'独立期初'});await write(`/api/v1/customers/${b.id}/opening-balance`,{amount:'-0.01',effectiveAt:'2026-01-01T00:00:00Z',reason:'另一候选'});
  await write('/api/v1/users',{loginName:'ai-worker',password,role:'employee'});const worker=await f.login('ai-worker');await write('/api/v1/users',{loginName:'ai-other-admin',password,role:'admin'});const other=await f.login('ai-other-admin');
  const facts=async()=>({operations:(await f.pool.query('SELECT count(*) FROM business_operations')).rows[0].count,ledger:(await f.pool.query('SELECT * FROM customer_ledger_entries ORDER BY id')).rows,accounts:(await f.pool.query('SELECT * FROM customer_accounts ORDER BY customer_id')).rows,cash:(await f.pool.query('SELECT count(*) FROM cash_events')).rows[0].count,stock:(await f.pool.query('SELECT count(*) FROM stock_movements')).rows[0].count});
  const original=await facts();const modelCalls=remote.calls;
  const forbidden=await f.app.inject({method:'POST',url:'/api/v1/ai/queries',headers:writeHeaders(worker),payload:{question:'华联欠款'}});assert.equal(forbidden.statusCode,403,forbidden.body);assert.equal(remote.calls,modelCalls);
  for(const question of ['增加华联商品库存100瓶','SELECT * FROM customer_accounts']){const r=await f.app.inject({method:'POST',url:'/api/v1/ai/queries',headers:writeHeaders(admin),payload:{question}});assert.equal(r.statusCode,422,r.body);assert.equal(remote.calls,modelCalls);}
  const c=parseSchema('AiResult',await write('/api/v1/ai/queries',{question:'华联当前欠款'},200));assert.equal(c.status,'needs_clarification');if(c.status!=='needs_clarification')throw new Error('must clarify');assert.equal(c.choices.length,2);assert.equal((await f.pool.query('SELECT count(*) FROM report_runs')).rows[0].count,'0');
  const badChoice=await f.app.inject({method:'POST',url:'/api/v1/ai/queries',headers:writeHeaders(admin),payload:{question:'华联当前欠款',clarificationRunId:c.id,clarificationAnswer:'not-a-choice'}});assert.equal(badChoice.statusCode,422,badChoice.body);
  const cross=await f.app.inject({method:'POST',url:'/api/v1/ai/queries',headers:writeHeaders(other),payload:{question:'华联当前欠款',clarificationRunId:c.id,clarificationAnswer:a.id}});assert.equal(cross.statusCode,404,cross.body);
  const answered=parseSchema('AiResult',await write('/api/v1/ai/queries',{question:'华联当前欠款',clarificationRunId:c.id,clarificationAnswer:a.id},200));assert.equal(answered.status,'answered');if(answered.status!=='answered')throw new Error('must answer');assert.equal(answered.report.kind,'customer_balances');if(answered.report.kind!=='customer_balances')throw new Error('wrong kind');assert.equal(answered.report.rows.length,1);assert.equal(answered.report.rows[0]!.customerId,a.id);assert.equal(answered.report.rows[0]!.netBalance,'12.34');assert.match(answered.summary,/12\.34/);assert.ok(!answered.summary.includes('999999.99'));assert.ok(answered.evidence.some(e=>e.entityType==='ledger_entry'));assert.deepEqual(await facts(),original);
  assert.ok(remote.payloads.every(p=>!p.includes(remote.key)&&!p.includes('13500000000')&&!p.includes('不应发送模型')));
  const fixed=await f.app.inject({url:`/api/v1/report-runs/${answered.report.id}`,headers:{cookie:admin.cookie}});assert.equal(fixed.statusCode,200,fixed.body);assert.deepEqual(fixed.json(),answered.report);
  await write('/api/v1/cash-events',{customerId:a.id,kind:'receipt',amount:'1.00',occurredAt:new Date().toISOString(),method:'cash',allocationMode:'manual'});const afterRealReceipt=await facts();const old=await f.app.inject({url:`/api/v1/report-runs/${answered.report.id}`,headers:{cookie:admin.cookie}});assert.deepEqual(old.json(),answered.report);
  for(const mode of ['sql','ids'] as const){remote.setMode(mode);const count=(await f.pool.query('SELECT count(*) FROM report_runs')).rows[0].count;const r=await f.app.inject({method:'POST',url:'/api/v1/ai/queries',headers:writeHeaders(admin),payload:{question:'华联当前欠款'}});assert.equal(r.statusCode,422,r.body);assert.equal((await f.pool.query('SELECT count(*) FROM report_runs')).rows[0].count,count);}
  remote.setMode('error');const unavailable=await f.app.inject({method:'POST',url:'/api/v1/ai/queries',headers:writeHeaders(admin),payload:{question:'华联当前欠款'}});assert.equal(unavailable.statusCode,503,unavailable.body);assert.ok(!unavailable.body.includes(remote.key));
  remote.setMode('delay');const delayed=f.app.inject({method:'POST',url:'/api/v1/ai/queries',headers:writeHeaders(admin),payload:{question:'华联当前欠款'}});await new Promise(resolve=>setTimeout(resolve,10));const overlap=await f.app.inject({method:'POST',url:'/api/v1/ai/queries',headers:writeHeaders(admin),payload:{question:'另一查询'}});assert.equal(overlap.statusCode,429,overlap.body);const timeout=await delayed;assert.equal(timeout.statusCode,503,timeout.body);assert.equal(timeout.json().retryable,true);
  remote.setMode('explain_delay');const fallback=parseSchema('AiResult',await write('/api/v1/ai/queries',{question:'华联当前欠款',clarificationRunId:c.id,clarificationAnswer:a.id},200));assert.equal(fallback.status,'answered');if(fallback.status!=='answered')throw new Error('must preserve report');assert.match(fallback.summary,/11\.34/);assert.ok(!fallback.summary.includes('999999.99'));assert.equal(fallback.report.kind,'customer_balances');assert.deepEqual(await facts(),afterRealReceipt);
  remote.setMode('direction');const wrongDirection=parseSchema('AiResult',await write('/api/v1/ai/queries',{question:'华联当前欠款',clarificationRunId:c.id,clarificationAnswer:a.id},200));assert.equal(wrongDirection.status,'answered');if(wrongDirection.status!=='answered')throw new Error('must answer');assert.match(wrongDirection.summary,/应收11\.34/);assert.ok(!wrongDirection.summary.includes('可退款'));assert.deepEqual(await facts(),afterRealReceipt);
 }finally{await f.cleanup();await remote.close();}
});


test('independent AI without configured model returns honest retryable failure and creates no result',async()=>{
 const f=await apiFixture();try{const admin=await f.login();const r=await f.app.inject({method:'POST',url:'/api/v1/ai/queries',headers:writeHeaders(admin),payload:{question:'查看经营统计'}});assert.equal(r.statusCode,503,r.body);assert.equal(r.json().code,'AI_PROVIDER_UNAVAILABLE');assert.equal(r.json().retryable,true);assert.equal((await f.pool.query('SELECT count(*) FROM ai_query_runs')).rows[0].count,'0');assert.equal((await f.pool.query('SELECT count(*) FROM report_runs')).rows[0].count,'0');}finally{await f.cleanup();}
});

test('independent AI permits statistical phrasing about refunds and inventory increases before model clarification',async()=>{
 let calls=0;const model={reference:'intent-boundary-fixture',async plan(){calls++;return{action:'clarify',query:null,entities:[],question:'请选择一个受支持的统计口径'};}};const f=await apiFixture({ai:{model}});
 try{const admin=await f.login();for(const question of ['查看本月退款金额','查看库存增加趋势','统计本月新增退款金额']){const r=await f.app.inject({method:'POST',url:'/api/v1/ai/queries',headers:writeHeaders(admin),payload:{question}});assert.equal(r.statusCode,200,`${question}: ${r.body}`);assert.equal(r.json().status,'needs_clarification');}assert.equal(calls,3);for(const question of ['先查看本月退款，再增加商品库存10瓶','统计完成后修改订单价格']){const r=await f.app.inject({method:'POST',url:'/api/v1/ai/queries',headers:writeHeaders(admin),payload:{question}});assert.equal(r.statusCode,422,`${question}: ${r.body}`);}assert.equal(calls,3);}finally{await f.cleanup();}
});
