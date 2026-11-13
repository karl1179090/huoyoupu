import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {withTransaction} from '@huoyoupu/database';
import {parseSchema,type SchemaValue} from '@huoyoupu/contracts';
import type {OperationContext} from '../src/lib/security.js';
import * as catalog from '../src/modules/catalog/service.js';
import {createReceipt} from '../src/modules/inventory/service.js';
import {apiFixture,writeHeaders} from './helpers.js';
import {printConfig} from './printing-fixtures.js';

test('printing versions, public projection, owner authorization and replays never change commercial state',async()=>{
 const f=await apiFixture();
 try{
  const admin=await f.login();
  const write=async(method:'POST'|'PATCH',url:string,payload:object,credentials=admin,headers=writeHeaders(credentials))=>{
   const result=await f.app.inject({method,url,headers,payload});return result;
  };
  const operation=<T>(work:(context:OperationContext)=>Promise<T>)=>withTransaction(f.pool,async client=>{const operationId=randomUUID();await client.query('INSERT INTO business_operations(id,kind,actor_id) VALUES($1,$2,$3)',[operationId,'printing_fixture',f.admin.id]);return work({client,actor:f.admin,operationId});});
  const product=await withTransaction(f.pool,client=>catalog.createProduct(client,{code:'PRINT-P',name:'很长但不得在打印数据中裁剪的商品名称'.repeat(5),baseUnit:{name:'瓶',defaultSalePrice:'2'},units:[{name:'件',multiplierBase:12,defaultSalePrice:'24'}]}));
  const customer=await withTransaction(f.pool,client=>catalog.createCustomer(client,{code:'PRINT-C',name:'虚构客户'}));
  const address=await withTransaction(f.pool,client=>catalog.createAddress(client,customer.id,{contactName:'虚构联系人',address:'测试长地址'.repeat(40),isDefault:true}));
  const warehouses=[];for(const code of ['PRINT-W1','PRINT-W2']){const w=await withTransaction(f.pool,client=>catalog.createWarehouse(client,{code,name:code}));warehouses.push(w);await operation(context=>createReceipt(context,{kind:'purchase',warehouseId:w.id,receivedAt:'2020-01-01T00:00:00Z',lines:[{productId:product.id,unitId:product.baseUnitId,quantity:24,unitCost:'1'}]}));}
  const input={customerId:customer.id,addressId:address.id,lines:warehouses.map((w,i)=>({clientLineId:`line-${i}`,productId:product.id,warehouseId:w.id,unitId:i===0?product.units.find(unit=>unit.name==='件')!.id:product.baseUnitId,quantity:i===0?1:2,unitPrice:i===0?'24':'2',allocationMode:'auto'})),discountAmount:'0.00',roundOffAmount:'0.00'};
  const draftResponse=await write('POST','/api/v1/orders',input);assert.equal(draftResponse.statusCode,201,draftResponse.body);const draft=parseSchema('OrderAdmin',draftResponse.json());
  const confirmedResponse=await write('POST',`/api/v1/orders/${draft.id}/confirm`,{expectedVersion:draft.version});assert.equal(confirmedResponse.statusCode,200,confirmedResponse.body);const order=parseSchema('OrderAdmin',confirmedResponse.json());
  const commercial=async()=>({order:(await f.pool.query('SELECT * FROM sales_orders WHERE id=$1',[order.id])).rows,stock:(await f.pool.query('SELECT * FROM stock_balances ORDER BY product_id,warehouse_id')).rows,movements:(await f.pool.query('SELECT * FROM stock_movements ORDER BY id')).rows,ledger:(await f.pool.query('SELECT * FROM customer_ledger_entries ORDER BY id')).rows,revisions:(await f.pool.query('SELECT * FROM order_revisions WHERE order_id=$1 ORDER BY revision_no',[order.id])).rows});
  const before=await commercial();
  const companyResponse=await write('PATCH','/api/v1/company',{expectedVersion:1,name:'虚构配送商',phone:'000-test',address:'测试公司地址'});assert.equal(companyResponse.statusCode,200,companyResponse.body);
  const templateResponse=await write('POST','/api/v1/print-templates',{name:'配送单',config:printConfig});assert.equal(templateResponse.statusCode,201,templateResponse.body);let template=parseSchema('PrintTemplate',templateResponse.json());
  const defaultResponse=await write('PATCH',`/api/v1/print-templates/${template.id}`,{expectedVersion:template.version,isDefault:true});assert.equal(defaultResponse.statusCode,200,defaultResponse.body);template=parseSchema('PrintTemplate',defaultResponse.json());
  const originalTemplateVersion=template.currentTemplateVersionId;
  const invalid=await write('POST',`/api/v1/print-templates/${template.id}/versions`,{expectedVersion:template.version,config:{...printConfig,columns:[{...printConfig.columns[0],widthMm:300}]}});assert.equal(invalid.statusCode,422,invalid.body);assert.equal(invalid.json().code,'PRINT_LAYOUT_INVALID');
  const leak=await write('POST','/api/v1/print-templates',{name:'非法成本列',config:{...printConfig,columns:[{...printConfig.columns[0],field:'costAmount'}]}});assert.equal(leak.statusCode,400,leak.body);
  const newer=await write('POST',`/api/v1/print-templates/${template.id}/versions`,{expectedVersion:template.version,config:{...printConfig,minRowHeightMm:9,columns:[...printConfig.columns].reverse()}});assert.equal(newer.statusCode,201,newer.body);template=parseSchema('PrintTemplate',newer.json());assert.equal(template.currentTemplateVersionNo,2);
  const oldTemplate=await f.app.inject({url:`/api/v1/print-templates/${template.id}/versions/${originalTemplateVersion}`,headers:{cookie:admin.cookie}});assert.equal(oldTemplate.statusCode,200,oldTemplate.body);assert.deepEqual(oldTemplate.json().config,printConfig);
  const employeeCreate=await write('POST','/api/v1/users',{loginName:'print-employee',password:'fictional-print-password',role:'employee'});assert.equal(employeeCreate.statusCode,201,employeeCreate.body);const employee=await f.login('print-employee','fictional-print-password');
  for(const credentials of [admin,employee]){
   const response=await f.app.inject({url:`/api/v1/orders/${order.id}/print-data`,headers:{cookie:credentials.cookie}});assert.equal(response.statusCode,200,response.body);const data=parseSchema('PrintData',response.json());assert.equal(data.templateVersionId,template.currentTemplateVersionId);assert.equal(data.order.lines.length,2);assert.notEqual(data.order.lines[0]?.warehouseId,data.order.lines[1]?.warehouseId);assert.equal(data.order.lines[0]?.productName,product.name);assert.equal(data.order.totalAmount,'28.00');assert.ok(!/"(?:costAmount|grossProfit|inputUnitCost|allocations)"/.test(response.body));
  }
  const payload={orderRevisionId:order.revisionId,templateVersionId:originalTemplateVersion,clientPlatform:'mobile_web'};
  const headers=writeHeaders(employee);const first=await write('POST',`/api/v1/orders/${order.id}/print-jobs`,payload,employee,headers);assert.equal(first.statusCode,201,first.body);const job=parseSchema('PrintJob',first.json());assert.equal(job.status,'requested');
  const replay=await write('POST',`/api/v1/orders/${order.id}/print-jobs`,payload,employee,headers);assert.equal(replay.headers['idempotency-replayed'],'true');assert.deepEqual(replay.json(),job);
  for(let i=0;i<2;i++){const reprint=await write('POST',`/api/v1/orders/${order.id}/print-jobs`,payload,employee);assert.equal(reprint.statusCode,201,reprint.body);}
  assert.equal((await f.pool.query('SELECT count(*) FROM print_jobs')).rows[0].count,'3');assert.deepEqual(await commercial(),before);
  const own=await write('PATCH',`/api/v1/print-jobs/${job.id}/status`,{status:'user_confirmed',note:'人工查看纸张后确认'},employee);assert.equal(own.statusCode,200,own.body);
  const management=await write('PATCH','/api/v1/company',{expectedVersion:2,name:'员工不允许修改'},employee);assert.equal(management.statusCode,403);
  const managerCreate=await write('POST','/api/v1/users',{loginName:'print-manager',password:'fictional-manager-password',role:'admin'});assert.equal(managerCreate.statusCode,201,managerCreate.body);const manager=await f.login('print-manager','fictional-manager-password');
  const managerHeaders=writeHeaders(manager);const managerPayload={status:'client_error',note:'管理员人工记录客户端报错'};
  const privileged=await write('PATCH',`/api/v1/print-jobs/${job.id}/status`,managerPayload,manager,managerHeaders);assert.equal(privileged.statusCode,200,privileged.body);
  const downgrade=await write('PATCH',`/api/v1/users/${manager.user.id}`,{expectedVersion:manager.user.version,role:'employee'});assert.equal(downgrade.statusCode,200,downgrade.body);
  const forbiddenReplay=await write('PATCH',`/api/v1/print-jobs/${job.id}/status`,managerPayload,manager,managerHeaders);assert.equal(forbiddenReplay.statusCode,403,forbiddenReplay.body);assert.equal(forbiddenReplay.headers['idempotency-replayed'],undefined);
  assert.deepEqual(await commercial(),before);
  const revisedResponse=await write('POST',`/api/v1/orders/${order.id}/revisions`,{expectedVersion:order.version,reason:'打印后改单',lineChanges:[{op:'set',lineId:order.lines[0]!.id,unitPrice:'25'}]});assert.equal(revisedResponse.statusCode,201,revisedResponse.body);const revised=parseSchema('OrderAdmin',revisedResponse.json());assert.equal(revised.currentRevisionPrintStatus,'not_requested');
  const oldPrint=await f.app.inject({url:`/api/v1/orders/${order.id}/print-data?revisionId=${order.revisionId}&templateVersionId=${originalTemplateVersion}`,headers:{cookie:employee.cookie}});assert.equal(oldPrint.statusCode,200,oldPrint.body);const oldData=parseSchema('PrintData',oldPrint.json());assert.equal(oldData.isCurrentOrderRevision,false);assert.equal(oldData.order.totalAmount,'28.00');assert.equal(oldData.templateVersionNo,1);
  const nextVersionJob=await write('POST',`/api/v1/orders/${order.id}/print-jobs`,{...payload,orderRevisionId:revised.revisionId},employee);assert.equal(nextVersionJob.statusCode,201,nextVersionJob.body);
  const currentRead=await f.app.inject({url:`/api/v1/orders/${order.id}`,headers:{cookie:employee.cookie}});assert.equal(currentRead.json().currentRevisionPrintStatus,'requested');assert.equal(currentRead.json().version,revised.version);
  const currentJob=parseSchema('PrintJob',nextVersionJob.json());const cancelled=await write('PATCH',`/api/v1/print-jobs/${currentJob.id}/status`,{status:'user_cancelled',note:'人工取消'},employee);assert.equal(cancelled.statusCode,200,cancelled.body);
  const cancelledRead=await f.app.inject({url:`/api/v1/orders/${order.id}`,headers:{cookie:employee.cookie}});assert.equal(cancelledRead.json().currentRevisionPrintStatus,'not_requested');assert.equal(cancelledRead.json().version,revised.version);
  const jobs=await f.app.inject({url:`/api/v1/orders/${order.id}/print-jobs?limit=1`,headers:{cookie:employee.cookie}});assert.equal(jobs.statusCode,200,jobs.body);assert.ok(jobs.json().nextCursor);
 }finally{await f.cleanup();}
});
