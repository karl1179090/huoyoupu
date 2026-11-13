import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {createResponsesAdapter} from '../../../apps/api/src/modules/ai/model.js';

test('independent native model adapter uses real HTTP, structured Responses envelope and safe provider failures',async()=>{
 const secret='fictional-acceptance-provider-secret';const received:{authorization:string|undefined;payload:{model:string;store:boolean;text:{format:{type:string;strict:boolean}}}}[]=[];let mode:'valid'|'bad'|'delay'='valid';const timers:NodeJS.Timeout[]=[];
 const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=String(chunk);received.push({authorization:req.headers.authorization,payload:JSON.parse(body)});if(mode==='bad'){res.writeHead(503);res.end(secret);return;}if(mode==='delay'){timers.push(setTimeout(()=>res.end('{}'),200));return;}res.setHeader('content-type','application/json');res.end(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({action:'query',queryJson:JSON.stringify({kind:'cash_flow'}),entities:[],question:null})}]}]}));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const endpoint=`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/responses`;
 try{
  const adapter=createResponsesAdapter({apiKey:secret,model:'fixture-model',endpoint});const plan=await adapter.plan({question:'查看资金流水',timezone:'Asia/Shanghai',asOf:'2026-11-10T01:00:00Z'},new AbortController().signal);assert.deepEqual(plan,{action:'query',query:{kind:'cash_flow'},entities:[],question:null});assert.equal(received.length,1);assert.equal(received[0]!.authorization,`Bearer ${secret}`);assert.equal(received[0]!.payload.model,'fixture-model');assert.equal(received[0]!.payload.store,false);assert.equal(received[0]!.payload.text.format.type,'json_schema');assert.equal(received[0]!.payload.text.format.strict,true);assert.ok(!JSON.stringify(received[0]!.payload).includes(secret));
  mode='bad';await assert.rejects(adapter.plan({question:'同一查询',timezone:'Asia/Shanghai',asOf:'2026-11-10T01:00:00Z'},new AbortController().signal),error=>{assert.ok(error instanceof Error);assert.ok(!error.message.includes(secret));return 'code'in error&&error.code==='AI_PROVIDER_UNAVAILABLE';});
  mode='delay';const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),20);await assert.rejects(adapter.plan({question:'超时',timezone:'Asia/Shanghai',asOf:'2026-11-10T01:00:00Z'},abort.signal),error=>error instanceof Error&&'code'in error&&error.code==='AI_PROVIDER_UNAVAILABLE');clearTimeout(timer);
  assert.throws(()=>createResponsesAdapter({apiKey:secret,model:'fixture-model',endpoint:'http://external.example.test/v1/responses'}));
 }finally{timers.forEach(clearTimeout);server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
