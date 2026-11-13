import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {withTransaction} from '@huoyoupu/database';
import {parseSchema} from '@huoyoupu/contracts';
import type {OperationContext} from '../src/lib/security.js';
import type {ModelAdapter,ModelInput} from '../src/modules/ai/model.js';
import {queryReport,getReportRun,getReportSources} from '../src/modules/reporting/service.js';
import {shanghaiInstant,shanghaiParts} from '../src/modules/reporting/query.js';
import * as catalog from '../src/modules/catalog/service.js';
import {createReceipt} from '../src/modules/inventory/service.js';
import {createDraft} from '../src/modules/sales/drafts.js';
import {confirmOrder} from '../src/modules/sales/confirm.js';
import {financePort} from '../src/modules/finance/core.js';
import {apiFixture,writeHeaders} from './helpers.js';

test('AI resolves actual entities, reuses frozen report facts and rejects untrusted intent before business effects',async t=>{
 const p=shanghaiParts(new Date());const previous=shanghaiInstant(p.year,p.month-1),current=shanghaiInstant(p.year,p.month),next=shanghaiInstant(p.year,p.month+1);
 let plan:unknown={action:'query',query:{kind:'customer_product_comparison',period:{mode:'custom',start:current.toISOString(),end:next.toISOString(),baselineStart:previous.toISOString(),baselineEnd:current.toISOString()},filters:{decreasesOnly:true}},entities:[{type:'product',term:'酱油'}],question:null};
 let calls=0;let mode:'normal'|'timeout'='normal';const inputs:ModelInput[]=[];let started:()=>void=()=>{};
 const model:ModelAdapter={reference:'fixture-model-no-real-provider',async plan(input){calls++;inputs.push(input);if(mode==='timeout'){started();return new Promise(()=>{});}return plan;},async explain(){return {summary:'模型捏造收入999.99元，净利润无限'};}};
 const f=await apiFixture({ai:{model,timeoutMs:200}});
 try{
  const admin=await f.login();
  const operation=<T>(work:(context:OperationContext)=>Promise<T>)=>withTransaction(f.pool,async client=>{const operationId=randomUUID();await client.query('INSERT INTO business_operations(id,kind,actor_id) VALUES($1,$2,$3)',[operationId,'ai_fixture',f.admin.id]);return work({client,actor:f.admin,operationId});});
  const product=await withTransaction(f.pool,client=>catalog.createProduct(client,{code:'AI-P1',name:'500ml酱油',baseUnit:{name:'瓶',defaultSalePrice:'2'}}));
  await withTransaction(f.pool,client=>catalog.createProduct(client,{code:'AI-P2',name:'1000ml酱油',baseUnit:{name:'瓶',defaultSalePrice:'3'}}));
  const customer=await withTransaction(f.pool,client=>catalog.createCustomer(client,{code:'AI-C1',name:'张店一号',phone:'13900000000'}));
  await withTransaction(f.pool,client=>catalog.createCustomer(client,{code:'AI-C2',name:'张店二号',phone:'13800000000'}));
  const address=await withTransaction(f.pool,client=>catalog.createAddress(client,customer.id,{contactName:'不应发给模型的联系人',phone:'13700000000',address:'不应发给模型的详细地址',isDefault:true}));
  const warehouse=await withTransaction(f.pool,client=>catalog.createWarehouse(client,{code:'AI-W',name:'测试仓'}));
  await operation(context=>createReceipt(context,{kind:'purchase',warehouseId:warehouse.id,receivedAt:'2020-01-01T00:00:00Z',lines:[{productId:product.id,unitId:product.baseUnitId,quantity:20,unitCost:'1'}]}));
  const draft=await operation(context=>createDraft(context,{customerId:customer.id,addressId:address.id,lines:[{clientLineId:'ai-order',productId:product.id,warehouseId:warehouse.id,unitId:product.baseUnitId,quantity:10,unitPrice:'2',allocationMode:'auto'}],discountAmount:'0.00',roundOffAmount:'0.00'}));
  t.mock.timers.enable({apis:['Date'],now:shanghaiInstant(p.year,p.month-1,5)});try{await operation(context=>confirmOrder(context,draft.id,draft.version,financePort));}finally{t.mock.timers.reset();}
  const business=async()=>({stock:(await f.pool.query('SELECT * FROM stock_balances ORDER BY product_id,warehouse_id')).rows,orders:(await f.pool.query('SELECT * FROM sales_orders ORDER BY id')).rows,ledger:(await f.pool.query('SELECT * FROM customer_ledger_entries ORDER BY id')).rows,movements:(await f.pool.query('SELECT * FROM stock_movements ORDER BY id')).rows});
  const before=await business();const question='哪些客户本月酱油下单量比上月少？';
  const ask=async(payload:object,credentials=admin)=>f.app.inject({method:'POST',url:'/api/v1/ai/queries',headers:writeHeaders(credentials),payload});
  const ambiguity=await ask({question});assert.equal(ambiguity.statusCode,200,ambiguity.body);const clarification=parseSchema('AiClarification',ambiguity.json());assert.equal(clarification.choices.length,2);assert.ok(clarification.choices.some(choice=>choice.id===product.id));
  const answer=await ask({question,clarificationRunId:clarification.id,clarificationAnswer:product.id});assert.equal(answer.statusCode,200,answer.body);const result=parseSchema('AiAnswer',answer.json());assert.equal(calls,1);assert.equal(result.report.kind,'customer_product_comparison');
  const report=parseSchema('Report_customer_product_comparison',result.report);assert.equal(report.rows[0]?.baselineOrderedQuantityBase,10);assert.equal(report.rows[0]?.currentOrderedQuantityBase,0);assert.equal(report.rows[0]?.changePercent,'-100.00');assert.equal(report.rows[0]?.baselineNetSalesAmount,'20.00');assert.equal(report.rows[0]?.currentNetSalesAmount,'0.00');assert.ok(!result.summary.includes('999.99'));assert.ok(result.summary.includes('退货0瓶'));
  assert.deepEqual(await getReportRun(f.pool,report.id),report);const normal=await queryReport(f.pool,f.admin.id,result.query);assert.deepEqual(normal.rows,report.rows);assert.equal(normal.sourceWatermark,report.sourceWatermark);
  const refs=await getReportSources(f.pool,report.id);assert.deepEqual(result.evidence,refs.items);assert.equal(refs.items[0]?.entityType,'order_revision');assert.deepEqual(await business(),before);
  assert.ok(!JSON.stringify(inputs).includes('13900000000'));assert.ok(!JSON.stringify(inputs).includes('详细地址'));assert.ok(!JSON.stringify(inputs).includes('不应发给模型的联系人'));
  const getResponse=await f.app.inject({url:`/api/v1/report-runs/${report.id}`,headers:{cookie:admin.cookie}});assert.equal(getResponse.statusCode,200,getResponse.body);assert.deepEqual(getResponse.json(),report);
  plan={action:'query',query:{kind:'sales_summary'},entities:[{type:'customer',term:'张店'}],question:null};const customerClarification=await ask({question:'张店本月销售额'});assert.equal(customerClarification.statusCode,200,customerClarification.body);assert.equal(customerClarification.json().status,'needs_clarification');assert.equal(customerClarification.json().choices.length,2);
  const wrongAnswer=await ask({question:'张店本月销售额',clarificationRunId:customerClarification.json().id,clarificationAnswer:randomUUID()});assert.equal(wrongAnswer.statusCode,422,wrongAnswer.body);
  const beforeBad=calls;const write=await ask({question:'给酱油增加库存10瓶'});assert.equal(write.statusCode,422);assert.equal(calls,beforeBad);
  plan={action:'query',query:{kind:'inventory',sql:'DELETE FROM stock_balances'},entities:[],question:null};const sql=await ask({question:'当前库存'});assert.equal(sql.statusCode,422,sql.body);assert.deepEqual(await business(),before);
  plan={action:'query',query:{kind:'inventory'},entities:[{type:'product',term:'没有这个虚构商品'}],question:null};const missing=await ask({question:'没有这个虚构商品的库存'});assert.equal(missing.statusCode,200,missing.body);assert.equal(missing.json().status,'needs_clarification');assert.deepEqual(missing.json().choices,[]);
  const employeeCreate=await f.app.inject({method:'POST',url:'/api/v1/users',headers:writeHeaders(admin),payload:{loginName:'ai-employee',password:'fictional-ai-password',role:'employee'}});assert.equal(employeeCreate.statusCode,201,employeeCreate.body);const employee=await f.login('ai-employee','fictional-ai-password');const preEmployee=calls;const forbidden=await ask({question:'当前库存'},employee);assert.equal(forbidden.statusCode,403);assert.equal(calls,preEmployee);
  const noCsrf=await f.app.inject({method:'POST',url:'/api/v1/ai/queries',headers:{cookie:admin.cookie},payload:{question:'当前库存'}});assert.equal(noCsrf.statusCode,403);assert.equal(calls,preEmployee);
  mode='timeout';const entered=new Promise<void>(resolve=>{started=resolve;});const waiting=ask({question:'当前库存'});await entered;
  const busy=await ask({question:'当前库存'});assert.equal(busy.statusCode,429,busy.body);
  const timeout=await waiting;assert.equal(timeout.statusCode,503,timeout.body);assert.equal(timeout.json().code,'AI_PROVIDER_UNAVAILABLE');assert.ok(!timeout.body.includes('fixture-model-no-real-provider'));assert.deepEqual(await business(),before);
 }finally{await f.cleanup();}
});
