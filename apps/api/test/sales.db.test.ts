import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createTestDatabase} from '@huoyoupu/database/testing';
import {withTransaction} from '@huoyoupu/database';
import {parseSchema} from '@huoyoupu/contracts';
import type {OperationContext} from '../src/lib/security.js';
import {createApp} from '../src/app.js';
import {registerAuth} from '../src/modules/auth/index.js';
import {initializeAdministrator} from '../src/modules/auth/service.js';
import {registerSales} from '../src/modules/sales/index.js';
import {financePort} from '../src/modules/finance/core.js';
import * as catalog from '../src/modules/catalog/service.js';
import {createReceipt} from '../src/modules/inventory/service.js';
import {origin,password,writeHeaders} from './helpers.js';

async function fixture(){
 const database=await createTestDatabase();const actor=await initializeAdministrator(database.pool,{loginName:'admin',password});
 const app=createApp();const security=registerAuth(app,database.pool,{origin});registerSales(app,{pool:database.pool,security},{finance:financePort});
 const operation=<T>(work:(context:OperationContext)=>Promise<T>)=>withTransaction(database.pool,async client=>{const operationId=randomUUID();await client.query('INSERT INTO business_operations(id,kind,actor_id) VALUES($1,\'sales_fixture\',$2)',[operationId,actor.id]);return work({client,actor,operationId});});
 const product=await withTransaction(database.pool,client=>catalog.createProduct(client,{code:'SOY',name:'500ml酱油',baseUnit:{name:'瓶',defaultSalePrice:'2'},units:[{name:'件',multiplierBase:12,defaultSalePrice:'24'}]}));
 const warehouse=await withTransaction(database.pool,client=>catalog.createWarehouse(client,{code:'W1',name:'主仓'}));
 const secondWarehouse=await withTransaction(database.pool,client=>catalog.createWarehouse(client,{code:'W2',name:'副仓'}));
 const customer=await withTransaction(database.pool,client=>catalog.createCustomer(client,{code:'C1',name:'虚构客户'}));
 const address=await withTransaction(database.pool,client=>catalog.createAddress(client,customer.id,{contactName:'虚构联系人',address:'测试地址',isDefault:true}));
 await operation(context=>createReceipt(context,{kind:'purchase',warehouseId:warehouse.id,receivedAt:'2026-01-01T00:00:00Z',lines:[{productId:product.id,unitId:product.baseUnitId,quantity:24,unitCost:'0.416666'}]}));
 await operation(context=>createReceipt(context,{kind:'purchase',warehouseId:secondWarehouse.id,receivedAt:'2026-01-01T00:00:00Z',lines:[{productId:product.id,unitId:product.baseUnitId,quantity:12,unitCost:'0.5'}]}));
 const challenge=await app.inject({url:'/api/v1/auth/session'});const login=await app.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin,cookie:String(challenge.headers['set-cookie']).split(';')[0]!,'x-csrf-token':challenge.json().csrfToken},payload:{loginName:'admin',password}});
 const credentials={cookie:String(login.headers['set-cookie']).split(';')[0]!,csrf:login.json().csrfToken as string};
 return{...database,app,operation,actor,product,warehouse,secondWarehouse,customer,address,credentials,cleanup:async()=>{await app.close();await database.cleanup();}};
}

test('sales draft, read-only quote, confirm and delivery metadata use real PostgreSQL and finance',async t=>{
 const f=await fixture();
 try{
  const payload={customerId:f.customer.id,addressId:f.address.id,lines:[{clientLineId:'main',productId:f.product.id,warehouseId:f.warehouse.id,unitId:f.product.units.find(unit=>unit.name==='件')!.id,quantity:1,unitPrice:'24',allocationMode:'auto'},{clientLineId:'second',productId:f.product.id,warehouseId:f.secondWarehouse.id,unitId:f.product.baseUnitId,quantity:2,unitPrice:'2',allocationMode:'auto'}],discountAmount:'2.00',roundOffAmount:'0.00'};
  let draft:ReturnType<typeof parseSchema<'OrderAdmin'>>;
  await t.test('draft neither reserves stock nor creates receivables and freezes delivery data',async()=>{
   const response=await f.app.inject({method:'POST',url:'/api/v1/orders',headers:writeHeaders(f.credentials),payload});assert.equal(response.statusCode,201,response.body);draft=parseSchema('OrderAdmin',response.json());assert.equal(draft.status,'draft');assert.equal(draft.totalAmount,'26.00');
   assert.equal((await f.pool.query('SELECT sum(quantity_base)::text AS q FROM stock_balances')).rows[0].q,'36');assert.equal((await f.pool.query('SELECT count(*) FROM customer_ledger_entries')).rows[0].count,'0');
   await withTransaction(f.pool,client=>catalog.patchAddress(client,f.customer.id,f.address.id,{expectedVersion:f.address.version,address:'后来变更地址'}));
   const read=await f.app.inject({url:`/api/v1/orders/${draft.id}`,headers:{cookie:f.credentials.cookie}});assert.equal(read.json().deliverySnapshot.address,'测试地址');
  });
  await t.test('quote exposes real computation without fabricated persisted IDs or side effects',async()=>{
   const before=(await f.pool.query('SELECT count(*) FROM sales_orders')).rows[0].count;
   const response=await f.app.inject({method:'POST',url:'/api/v1/orders/quote',headers:writeHeaders(f.credentials),payload});assert.equal(response.statusCode,200,response.body);const quote=parseSchema('OrderQuote',response.json());assert.equal(quote.stockReserved,false);assert.equal(quote.calculation.totalAmount,'26.00');assert.equal(quote.calculation.lines.length,2);assert.ok(quote.calculation.lines.every(line=>line.sourceLineId===null));assert.equal(quote.calculation.accountChanges[0]?.afterNetBalance,'26.00');assert.ok(!('id'in quote)&&!('orderId'in quote));
   assert.equal((await f.pool.query('SELECT count(*) FROM sales_orders')).rows[0].count,before);assert.equal((await f.pool.query('SELECT count(*) FROM sale_allocations')).rows[0].count,'0');assert.equal((await f.pool.query('SELECT count(*) FROM customer_accounts')).rows[0].count,'0');
  });
  await t.test('draft patch versions and preserves its frozen delivery snapshot',async()=>{
   const headers=writeHeaders(f.credentials);const payload={expectedVersion:draft.version,remark:'修改草稿备注'};
   const response=await f.app.inject({method:'PATCH',url:`/api/v1/orders/${draft.id}`,headers,payload});assert.equal(response.statusCode,200,response.body);
   const patched=parseSchema('OrderAdmin',response.json());assert.equal(patched.version,draft.version+1);assert.equal(patched.remark,'修改草稿备注');assert.equal(patched.deliverySnapshot.address,'测试地址');
   const replay=await f.app.inject({method:'PATCH',url:`/api/v1/orders/${draft.id}`,headers,payload});assert.deepEqual(replay.json(),patched);assert.equal(replay.headers['idempotency-replayed'],'true');draft=patched;
   const stale=await f.app.inject({method:'PATCH',url:`/api/v1/orders/${draft.id}`,headers:writeHeaders(f.credentials),payload:{expectedVersion:1,remark:'过期版本'}});assert.equal(stale.statusCode,409);assert.equal(stale.json().code,'VERSION_CONFLICT');
  });
  let confirmed:ReturnType<typeof parseSchema<'OrderAdmin'>>;
  await t.test('confirm atomically issues separate warehouses, fixes costs and records one receivable',async()=>{
   const headers=writeHeaders(f.credentials);const payload={expectedVersion:draft.version};const response=await f.app.inject({method:'POST',url:`/api/v1/orders/${draft.id}/confirm`,headers,payload});assert.equal(response.statusCode,200,response.body);confirmed=parseSchema('OrderAdmin',response.json());assert.equal(confirmed.status,'confirmed');assert.equal(confirmed.lines.length,2);assert.equal(confirmed.costAmount,'6.00');assert.equal(confirmed.totalAmount,'26.00');assert.equal(confirmed.accountChanges[0]?.afterNetBalance,'26.00');
   const replay=await f.app.inject({method:'POST',url:`/api/v1/orders/${draft.id}/confirm`,headers,payload});assert.equal(replay.headers['idempotency-replayed'],'true');assert.deepEqual(replay.json(),confirmed);
   assert.equal((await f.pool.query('SELECT sum(quantity_base)::text AS q FROM stock_balances')).rows[0].q,'22');assert.equal((await f.pool.query('SELECT net_balance::text FROM customer_accounts WHERE customer_id=$1',[f.customer.id])).rows[0].net_balance,'26.00');
  });
  await t.test('delivery metadata changes no stock, ledger, or commercial revision',async()=>{
   const response=await f.app.inject({method:'POST',url:`/api/v1/orders/${confirmed.id}/delivery`,headers:writeHeaders(f.credentials),payload:{expectedVersion:confirmed.version,deliveryStatus:'delivered'}});assert.equal(response.statusCode,200,response.body);const delivered=parseSchema('OrderAdmin',response.json());assert.equal(delivered.revisionId,confirmed.revisionId);assert.equal(delivered.deliveryStatus,'delivered');assert.equal((await f.pool.query('SELECT sum(quantity_base)::text AS q FROM stock_balances')).rows[0].q,'22');assert.equal((await f.pool.query('SELECT count(*) FROM customer_ledger_entries')).rows[0].count,'1');
  });
  await t.test('one insufficient line rejects the entire multi-warehouse confirmation',async()=>{
   const insufficient={...payload,discountAmount:'0.00',lines:[{...payload.lines[0]!,unitId:f.product.baseUnitId,quantity:13},{...payload.lines[1]!,quantity:1}]};
   const response=await f.app.inject({method:'POST',url:'/api/v1/orders',headers:writeHeaders(f.credentials),payload:insufficient});assert.equal(response.statusCode,201,response.body);const extra=parseSchema('OrderAdmin',response.json());
   const failed=await f.app.inject({method:'POST',url:`/api/v1/orders/${extra.id}/confirm`,headers:writeHeaders(f.credentials),payload:{expectedVersion:extra.version}});assert.equal(failed.statusCode,409,failed.body);assert.equal(failed.json().code,'INSUFFICIENT_STOCK');
   assert.equal((await f.pool.query('SELECT sum(quantity_base)::text AS q FROM stock_balances')).rows[0].q,'22');assert.equal((await f.pool.query('SELECT count(*) FROM sale_allocations')).rows[0].count,'2');assert.equal((await f.pool.query('SELECT count(*) FROM customer_ledger_entries')).rows[0].count,'1');
   assert.equal((await f.pool.query('SELECT status FROM sales_orders WHERE id=$1',[extra.id])).rows[0].status,'draft');
  });
  await t.test('revision quote is read-only and delivered price-only revision preserves every source cost',async()=>{
   const current=parseSchema('OrderAdmin',(await f.app.inject({url:`/api/v1/orders/${confirmed.id}`,headers:{cookie:f.credentials.cookie}})).json());
   const revision={expectedVersion:current.version,reason:'仅改价格',lineChanges:[{op:'set',lineId:current.lines[0]!.id,unitPrice:'26'}]};
   const before=(await f.pool.query('SELECT count(*) FROM order_revisions')).rows[0].count;
   const quote=await f.app.inject({method:'POST',url:'/api/v1/orders/quote',headers:writeHeaders(f.credentials),payload:{orderId:current.id,revision}});assert.equal(quote.statusCode,200,quote.body);assert.equal(quote.json().calculation.totalAmount,'28.00');assert.equal(quote.json().calculation.costAmount,'6.00');assert.equal((await f.pool.query('SELECT count(*) FROM order_revisions')).rows[0].count,before);
   const response=await f.app.inject({method:'POST',url:`/api/v1/orders/${current.id}/revisions`,headers:writeHeaders(f.credentials),payload:revision});assert.equal(response.statusCode,201,response.body);const revised=parseSchema('OrderAdmin',response.json());
   assert.equal(revised.deliveryStatus,'delivered');assert.equal(revised.totalAmount,'28.00');assert.equal(revised.costAmount,current.costAmount);assert.deepEqual(revised.lines.map(line=>line.allocations),current.lines.map(line=>line.allocations));assert.equal(revised.confirmedAt,current.confirmedAt);assert.equal(revised.accountChanges[0]?.afterNetBalance,'28.00');confirmed=revised;
   const old=await f.app.inject({url:`/api/v1/orders/${current.id}/revisions/${current.revisionId}`,headers:{cookie:f.credentials.cookie}});assert.equal(old.statusCode,200,old.body);assert.equal(old.json().totalAmount,'26.00');assert.equal(old.json().isCurrentRevision,false);const rejectedVoid=await f.app.inject({method:'POST',url:`/api/v1/orders/${revised.id}/void`,headers:writeHeaders(f.credentials),payload:{expectedVersion:revised.version,reason:'已配送不可作废'}});assert.equal(rejectedVoid.statusCode,409,rejectedVoid.body);
  });
  await t.test('increment issues only extra quantity, unchanged line keeps cost, and insufficient revision is atomic',async()=>{
   const request={expectedVersion:confirmed.version,reason:'增加一件',lineChanges:[{op:'set',lineId:confirmed.lines[0]!.id,quantity:2}]};
   const response=await f.app.inject({method:'POST',url:`/api/v1/orders/${confirmed.id}/revisions`,headers:writeHeaders(f.credentials),payload:request});assert.equal(response.statusCode,201,response.body);const incremented=parseSchema('OrderAdmin',response.json());assert.equal(incremented.lines[0]!.allocations.length,2);assert.equal(incremented.lines[0]!.allocations[0]!.id,confirmed.lines[0]!.allocations[0]!.id);assert.deepEqual(incremented.lines[1]!.allocations,confirmed.lines[1]!.allocations);assert.equal(incremented.costAmount,'11.00');
   const before=JSON.stringify(incremented);const failed=await f.app.inject({method:'POST',url:`/api/v1/orders/${confirmed.id}/revisions`,headers:writeHeaders(f.credentials),payload:{expectedVersion:incremented.version,reason:'缺货增加',lineChanges:[{op:'set',lineId:incremented.lines[0]!.id,quantity:3}]}});assert.equal(failed.statusCode,409,failed.body);assert.equal(failed.json().code,'INSUFFICIENT_STOCK');
   const after=parseSchema('OrderAdmin',(await f.app.inject({url:`/api/v1/orders/${confirmed.id}`,headers:{cookie:f.credentials.cookie}})).json());const expected=JSON.parse(before);expected.accountChanges=[];assert.deepEqual(after,expected);assert.equal((await f.pool.query('SELECT sum(quantity_base)::text AS q FROM stock_balances')).rows[0].q,'10');confirmed=incremented;
  });
  let returned:ReturnType<typeof parseSchema<'SalesReturn'>>;
  await t.test('return credit immediately reduces receivable without restoring stock or refunding cash',async()=>{
   const response=await f.app.inject({method:'POST',url:`/api/v1/orders/${confirmed.id}/returns`,headers:writeHeaders(f.credentials),payload:{expectedVersion:confirmed.version,reason:'退三瓶',lines:[{lineId:confirmed.lines[0]!.id,quantityBase:3,restockDisposition:'not_returning'}]}});assert.equal(response.statusCode,201,response.body);returned=parseSchema('SalesReturn',response.json());assert.equal(returned.lines[0]!.quantityBase,3);assert.equal(returned.costCreditAmount,'1.25');assert.equal(returned.refundedAmount,'0.00');assert.equal((await f.pool.query('SELECT sum(quantity_base)::text q FROM stock_balances')).rows[0].q,'10');assert.equal((await f.pool.query('SELECT count(*) FROM cash_events')).rows[0].count,'0');assert.equal((await f.pool.query('SELECT sum(amount)::numeric(20,2)::text amount FROM inventory_loss_entries')).rows[0].amount,'1.25');
   confirmed=parseSchema('OrderAdmin',(await f.app.inject({url:`/api/v1/orders/${confirmed.id}`,headers:{cookie:f.credentials.cookie}})).json());assert.equal(confirmed.returnAmount,returned.returnAmount);
  });
  await t.test('return then revise normalizes history, preserves source links and releases only unreturned quantity',async()=>{
   const first=confirmed.lines[0]!;const response=await f.app.inject({method:'POST',url:`/api/v1/orders/${confirmed.id}/revisions`,headers:writeHeaders(f.credentials),payload:{expectedVersion:confirmed.version,reason:'保留一件含三瓶已退',lineChanges:[{op:'set',lineId:first.id,quantity:1}]}});assert.equal(response.statusCode,201,response.body);const revised=parseSchema('OrderAdmin',response.json());const history=revised.lines.find(l=>l.readOnly)!;const editable=revised.lines.find(l=>l.kind==='derived')!;assert.equal(history.quantityBase,3);assert.equal(history.netAmount,returned.returnAmount);assert.equal(history.costAmount,'1.25');assert.equal(editable.quantityBase,9);assert.equal(editable.quantity,null);assert.equal(editable.unitId,f.product.baseUnitId);assert.equal(editable.allocations.reduce((sum,a)=>sum+a.quantityBase,0),9);assert.equal(revised.costAmount,'6.00');assert.equal(revised.confirmedAt,confirmed.confirmedAt);assert.equal((await f.pool.query('SELECT sum(quantity_base)::text q FROM stock_balances')).rows[0].q,'22');
   const locked=await f.app.inject({method:'POST',url:`/api/v1/orders/${confirmed.id}/revisions`,headers:writeHeaders(f.credentials),payload:{expectedVersion:revised.version,reason:'不能改历史',lineChanges:[{op:'set',lineId:history.id,quantity:1}]}});assert.equal(locked.statusCode,409,locked.body);confirmed=revised;
  });
  await t.test('actual partial restock preserves its persisted credit cost after revision and reverses only loss',async()=>{
   const creditBefore=(await f.pool.query('SELECT net_balance FROM customer_accounts WHERE customer_id=$1',[f.customer.id])).rows[0].net_balance;const selection=returned.lines[0]!.allocations[0]!;
   const response=await f.app.inject({method:'POST',url:`/api/v1/returns/${returned.id}/restocks`,headers:writeHeaders(f.credentials),payload:{expectedVersion:returned.version,restockedAt:new Date().toISOString(),lines:[{returnAllocationId:selection.id,quantityBase:1}]}});assert.equal(response.statusCode,201,response.body);const restock=parseSchema('Restock',response.json());assert.equal(restock.lines[0]!.costAmount,'0.42');assert.equal((await f.pool.query('SELECT net_balance FROM customer_accounts WHERE customer_id=$1',[f.customer.id])).rows[0].net_balance,creditBefore);assert.equal((await f.pool.query('SELECT sum(quantity_base)::text q FROM stock_balances')).rows[0].q,'23');assert.equal((await f.pool.query('SELECT sum(amount)::numeric(20,2)::text amount FROM inventory_loss_entries')).rows[0].amount,'0.83');
   const failed=await f.app.inject({method:'POST',url:`/api/v1/returns/${returned.id}/restocks`,headers:writeHeaders(f.credentials),payload:{expectedVersion:restock.returnVersion,restockedAt:new Date().toISOString(),lines:[{returnAllocationId:selection.id,quantityBase:3}]}});assert.equal(failed.statusCode,422,failed.body);
  });
 }finally{await f.cleanup();}
});

test('commercial customer reclassification preserves cash and original business dates; void absorbs returns exactly once',async t=>{
 const f=await fixture();
 try{
  const make=async(quantity=12)=>{const response=await f.app.inject({method:'POST',url:'/api/v1/orders',headers:writeHeaders(f.credentials),payload:{customerId:f.customer.id,addressId:f.address.id,lines:[{clientLineId:randomUUID(),productId:f.product.id,warehouseId:f.warehouse.id,unitId:f.product.baseUnitId,quantity,unitPrice:'2',allocationMode:'auto'}],discountAmount:'1.00',roundOffAmount:'0.00'}});assert.equal(response.statusCode,201,response.body);const d=response.json();const c=await f.app.inject({method:'POST',url:`/api/v1/orders/${d.id}/confirm`,headers:writeHeaders(f.credentials),payload:{expectedVersion:d.version}});assert.equal(c.statusCode,200,c.body);return parseSchema('OrderAdmin',c.json());};
  let order=await make();let returned:ReturnType<typeof parseSchema<'SalesReturn'>>;
  const {recordCash}=await import('../src/modules/finance/cash.js');
  const cash=await f.operation(context=>recordCash(context,{customerId:f.customer.id,kind:'receipt',amount:'30.00',occurredAt:new Date().toISOString(),method:'cash',allocationMode:'auto'}));
  await t.test('credit, partial restock, reduction, then void restore each original unit once and preserve actual money',async()=>{
   const r=await f.app.inject({method:'POST',url:`/api/v1/orders/${order.id}/returns`,headers:writeHeaders(f.credentials),payload:{expectedVersion:order.version,reason:'部分退货',lines:[{lineId:order.lines[0]!.id,quantityBase:3,restockDisposition:'not_returning'}]}});assert.equal(r.statusCode,201,r.body);returned=parseSchema('SalesReturn',r.json());
   const a=returned.lines[0]!.allocations[0]!;const restock=await f.app.inject({method:'POST',url:`/api/v1/returns/${returned.id}/restocks`,headers:writeHeaders(f.credentials),payload:{expectedVersion:returned.version,restockedAt:new Date().toISOString(),lines:[{returnAllocationId:a.id,quantityBase:1}]}});assert.equal(restock.statusCode,201,restock.body);
   const revision=await f.app.inject({method:'POST',url:`/api/v1/orders/${order.id}/revisions`,headers:writeHeaders(f.credentials),payload:{expectedVersion:returned.orderVersion,reason:'退后减至八瓶含已退',lineChanges:[{op:'set',lineId:order.lines[0]!.id,quantity:8}]}});assert.equal(revision.statusCode,201,revision.body);order=parseSchema('OrderAdmin',revision.json());
   const headers=writeHeaders(f.credentials);const payload={expectedVersion:order.version,reason:'整单作废合并退货'};const v=await f.app.inject({method:'POST',url:`/api/v1/orders/${order.id}/void`,headers,payload});assert.equal(v.statusCode,200,v.body);const voided=parseSchema('OrderAdmin',v.json());assert.equal(voided.status,'voided');assert.equal(voided.returnAmount,'0.00');assert.equal((await f.pool.query('SELECT sum(quantity_base)::text q FROM stock_balances')).rows[0].q,'36');assert.equal((await f.pool.query('SELECT sum(amount)::numeric(20,2)::text amount FROM inventory_loss_entries')).rows[0].amount,'0.00');assert.equal((await f.pool.query('SELECT net_balance FROM customer_accounts WHERE customer_id=$1',[f.customer.id])).rows[0].net_balance,'-30.00');
   const replay=await f.app.inject({method:'POST',url:`/api/v1/orders/${order.id}/void`,headers,payload});assert.equal(replay.headers['idempotency-replayed'],'true');assert.deepEqual(replay.json(),voided);
   const closed=await f.app.inject({url:`/api/v1/returns/${returned.id}`,headers:{cookie:f.credentials.cookie}});assert.equal(closed.json().status,'absorbed_by_void');const prohibited=await f.app.inject({method:'POST',url:`/api/v1/returns/${returned.id}/restocks`,headers:writeHeaders(f.credentials),payload:{expectedVersion:closed.json().version,restockedAt:new Date().toISOString(),lines:[{returnAllocationId:a.id,quantityBase:1}]}});assert.equal(prohibited.statusCode,409,prohibited.body);
   assert.equal((await f.pool.query('SELECT amount,status,customer_id FROM cash_events WHERE id=$1',[cash.id])).rows[0].status,'active');assert.equal((await f.pool.query('SELECT count(*) FROM cash_events')).rows[0].count,'1');
  });
  await t.test('customer change reclassifies sale and return on their original dates and releases old cash allocation',async()=>{
   order=await make(6);const r=await f.app.inject({method:'POST',url:`/api/v1/orders/${order.id}/returns`,headers:writeHeaders(f.credentials),payload:{expectedVersion:order.version,reason:'换客前退货',lines:[{lineId:order.lines[0]!.id,quantityBase:1}]}});assert.equal(r.statusCode,201,r.body);const ret=parseSchema('SalesReturn',r.json());
   const next=await withTransaction(f.pool,async client=>{const c=await catalog.createCustomer(client,{code:'C2',name:'第二虚构客户'});await catalog.createAddress(client,c.id,{contactName:'测试',address:'新客户地址',isDefault:true});return c;});
   const before=(await f.pool.query(`SELECT * FROM customer_ledger_entries WHERE order_id=$1 ORDER BY effective_at,id`,[order.id])).rows;
   const response=await f.app.inject({method:'POST',url:`/api/v1/orders/${order.id}/revisions`,headers:writeHeaders(f.credentials),payload:{expectedVersion:ret.orderVersion,customerId:next.id,reason:'客户选择更正',lineChanges:[]}});assert.equal(response.statusCode,201,response.body);const revised=parseSchema('OrderAdmin',response.json());assert.equal(revised.customerId,next.id);assert.equal(revised.accountChanges.length,2);assert.equal(revised.confirmedAt,order.confirmedAt);
   const after=(await f.pool.query(`SELECT * FROM customer_ledger_entries WHERE order_id=$1 AND customer_id=$2 ORDER BY effective_at,id`,[order.id,next.id])).rows;assert.equal(after.length,2);assert.deepEqual(after.map(e=>[e.category,e.effective_at.toISOString(),e.amount_signed]).sort(),before.map(e=>[e.category,e.effective_at.toISOString(),e.amount_signed]).sort());
   assert.equal((await f.pool.query('SELECT net_balance FROM customer_accounts WHERE customer_id=$1',[f.customer.id])).rows[0].net_balance,'-30.00');assert.equal((await f.pool.query('SELECT customer_id FROM cash_events WHERE id=$1',[cash.id])).rows[0].customer_id,f.customer.id);
   const back=await f.app.inject({method:'POST',url:`/api/v1/orders/${order.id}/revisions`,headers:writeHeaders(f.credentials),payload:{expectedVersion:revised.version,customerId:f.customer.id,reason:'再次纠正客户',lineChanges:[]}});assert.equal(back.statusCode,201,back.body);assert.equal((await f.pool.query('SELECT net_balance FROM customer_accounts WHERE customer_id=$1',[next.id])).rows[0].net_balance,'0.00');
  });
 }finally{await f.cleanup();}
});

test('two orders competing for the last stock and two versions competing for one order serialize',async()=>{
 const f=await fixture();
 try{
  const payload={customerId:f.customer.id,lines:[{clientLineId:'last',productId:f.product.id,warehouseId:f.warehouse.id,unitId:f.product.baseUnitId,quantity:20,unitPrice:'0',allocationMode:'auto'}],discountAmount:'0.00',roundOffAmount:'0.00'};
  const drafts=[];for(let i=0;i<2;i++){const response=await f.app.inject({method:'POST',url:'/api/v1/orders',headers:writeHeaders(f.credentials),payload});assert.equal(response.statusCode,201,response.body);drafts.push(response.json());}
  const competing=await Promise.all(drafts.map(d=>f.app.inject({method:'POST',url:`/api/v1/orders/${d.id}/confirm`,headers:writeHeaders(f.credentials),payload:{expectedVersion:d.version}})));assert.deepEqual(competing.map(r=>r.statusCode).sort(),[200,409]);assert.equal((await f.pool.query('SELECT quantity_base FROM stock_balances WHERE warehouse_id=$1',[f.warehouse.id])).rows[0].quantity_base,'4');
  const winner=competing.find(r=>r.statusCode===200)!.json();const revisions=await Promise.all(['a','b'].map(reason=>f.app.inject({method:'POST',url:`/api/v1/orders/${winner.id}/revisions`,headers:writeHeaders(f.credentials),payload:{expectedVersion:winner.version,reason,lineChanges:[],remark:reason}})));assert.deepEqual(revisions.map(r=>r.statusCode).sort(),[201,409]);assert.equal(revisions.find(r=>r.statusCode===409)!.json().code,'VERSION_CONFLICT');
  assert.equal((await f.pool.query('SELECT count(*) FROM sale_allocations')).rows[0].count,'1');assert.equal((await f.pool.query('SELECT sum(net_balance)::text amount FROM customer_accounts')).rows[0].amount,'0.00');
 }finally{await f.cleanup();}
});

test('zero-price return, revision release, then actual restock conserve out-of-order one-cent cost',async()=>{
 const f=await fixture();
 try{
  const w=await withTransaction(f.pool,c=>catalog.createWarehouse(c,{code:'TAIL',name:'尾差仓'}));await f.operation(context=>createReceipt(context,{kind:'purchase',warehouseId:w.id,receivedAt:'2026-01-01T00:00:00Z',lines:[{productId:f.product.id,unitId:f.product.baseUnitId,quantity:3,unitCost:'0.003333'}]}));
  const d=(await f.app.inject({method:'POST',url:'/api/v1/orders',headers:writeHeaders(f.credentials),payload:{customerId:f.customer.id,lines:[{clientLineId:'tail',productId:f.product.id,warehouseId:w.id,unitId:f.product.baseUnitId,quantity:3,unitPrice:'0',allocationMode:'auto'}],discountAmount:'0.00',roundOffAmount:'0.00'}})).json();const c=await f.app.inject({method:'POST',url:`/api/v1/orders/${d.id}/confirm`,headers:writeHeaders(f.credentials),payload:{expectedVersion:d.version}});assert.equal(c.statusCode,200,c.body);const o=c.json();assert.equal(o.costAmount,'0.01');assert.equal(o.grossProfit,'-0.01');
  const r=await f.app.inject({method:'POST',url:`/api/v1/orders/${o.id}/returns`,headers:writeHeaders(f.credentials),payload:{expectedVersion:o.version,reason:'零价退货',lines:[{lineId:o.lines[0].id,quantityBase:1}]}});assert.equal(r.statusCode,201,r.body);const returned=parseSchema('SalesReturn',r.json());assert.equal(returned.costCreditAmount,'0.00');assert.equal(returned.returnAmount,'0.00');
  const revision=await f.app.inject({method:'POST',url:`/api/v1/orders/${o.id}/revisions`,headers:writeHeaders(f.credentials),payload:{expectedVersion:returned.orderVersion,reason:'释放余下两瓶',lineChanges:[{op:'set',lineId:o.lines[0].id,quantity:1}]}});assert.equal(revision.statusCode,201,revision.body);assert.equal(revision.json().costAmount,'0.00');
  const rs=await f.app.inject({method:'POST',url:`/api/v1/returns/${returned.id}/restocks`,headers:writeHeaders(f.credentials),payload:{expectedVersion:returned.version,restockedAt:new Date().toISOString(),lines:[{returnAllocationId:returned.lines[0]!.allocations[0]!.id,quantityBase:1}]}});assert.equal(rs.statusCode,201,rs.body);assert.equal(rs.json().lines[0].costAmount,'0.00');
  const balance=(await f.pool.query('SELECT quantity_base,cost_amount FROM stock_balances WHERE warehouse_id=$1',[w.id])).rows[0];assert.equal(balance.quantity_base,'3');assert.equal(balance.cost_amount,'0.01');
 }finally{await f.cleanup();}
});

test('one twelve-bottle unit returned by three bottles retains rational price and forbids altering history',async()=>{
 const f=await fixture();try{
  const caseUnit=f.product.units.find(u=>u.name==='件')!;
  const d=(await f.app.inject({method:'POST',url:'/api/v1/orders',headers:writeHeaders(f.credentials),payload:{customerId:f.customer.id,lines:[{clientLineId:'case',productId:f.product.id,warehouseId:f.warehouse.id,unitId:caseUnit.id,quantity:1,unitPrice:'10',allocationMode:'auto'}],discountAmount:'0.00',roundOffAmount:'0.00'}})).json();
  const c=(await f.app.inject({method:'POST',url:`/api/v1/orders/${d.id}/confirm`,headers:writeHeaders(f.credentials),payload:{expectedVersion:d.version}})).json();
  const r=await f.app.inject({method:'POST',url:`/api/v1/orders/${d.id}/returns`,headers:writeHeaders(f.credentials),payload:{expectedVersion:c.version,reason:'十二瓶退三',lines:[{lineId:c.lines[0].id,quantityBase:3}]}});assert.equal(r.statusCode,201,r.body);const ret=r.json();assert.equal(ret.returnAmount,'2.50');
  const invalid=await f.app.inject({method:'POST',url:`/api/v1/orders/${d.id}/revisions`,headers:writeHeaders(f.credentials),payload:{expectedVersion:ret.orderVersion,reason:'低于已退',lineChanges:[{op:'set',lineId:c.lines[0].id,unitId:f.product.baseUnitId,quantity:2}]}});assert.equal(invalid.statusCode,422,invalid.body);
  const removed=await f.app.inject({method:'POST',url:`/api/v1/orders/${d.id}/revisions`,headers:writeHeaders(f.credentials),payload:{expectedVersion:ret.orderVersion,reason:'不能删原来源',lineChanges:[{op:'remove',lineId:c.lines[0].id}]}});assert.equal(removed.statusCode,409,removed.body);
  const revised=await f.app.inject({method:'POST',url:`/api/v1/orders/${d.id}/revisions`,headers:writeHeaders(f.credentials),payload:{expectedVersion:ret.orderVersion,reason:'余九瓶按每件十一元',lineChanges:[{op:'set',lineId:c.lines[0].id,unitPrice:'11'}]}});assert.equal(revised.statusCode,201,revised.body);const order=parseSchema('OrderAdmin',revised.json());assert.equal(order.totalAmount,'10.75');assert.equal(order.lines.find(l=>l.readOnly)!.netAmount,'2.50');const editable=order.lines.find(l=>l.kind==='derived')!;assert.equal(editable.quantityBase,9);assert.equal(editable.netAmount,'8.25');assert.equal(editable.unitPrice,'0.916667');
  const unchanged=await f.app.inject({method:'POST',url:`/api/v1/orders/${d.id}/revisions`,headers:writeHeaders(f.credentials),payload:{expectedVersion:order.version,reason:'仅备注',lineChanges:[{op:'set',lineId:editable.id,remark:'保持原有理价格'}]}});assert.equal(unchanged.statusCode,201,unchanged.body);assert.equal(unchanged.json().totalAmount,'10.75');
  const next=unchanged.json();const down=await f.app.inject({method:'POST',url:`/api/v1/orders/${d.id}/revisions`,headers:writeHeaders(f.credentials),payload:{expectedVersion:next.version,reason:'余量改八瓶',lineChanges:[{op:'set',lineId:editable.id,quantity:8}]}});assert.equal(down.statusCode,201,down.body);assert.equal(down.json().lines.find((l:any)=>l.kind==='derived').subtotalAmount,'7.33');assert.equal((await f.pool.query('SELECT sum(quantity_base)::text q FROM stock_balances')).rows[0].q,'25');
 }finally{await f.cleanup();}
});

test('employee order page, detail, historic detail and errors never expose nested costs and cannot write',async()=>{
 const f=await fixture();try{
  const user=await f.app.inject({method:'POST',url:'/api/v1/users',headers:writeHeaders(f.credentials),payload:{loginName:'worker',password,role:'employee'}});assert.equal(user.statusCode,201,user.body);
  const challenge=await f.app.inject({url:'/api/v1/auth/session'});const logged=await f.app.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin,cookie:String(challenge.headers['set-cookie']).split(';')[0]!,'x-csrf-token':challenge.json().csrfToken},payload:{loginName:'worker',password}});assert.equal(logged.statusCode,200,logged.body);const employee={cookie:String(logged.headers['set-cookie']).split(';')[0]!,csrf:logged.json().csrfToken};
  const d=await f.app.inject({method:'POST',url:'/api/v1/orders',headers:writeHeaders(f.credentials),payload:{customerId:f.customer.id,lines:[{clientLineId:'public',productId:f.product.id,warehouseId:f.warehouse.id,unitId:f.product.baseUnitId,quantity:1,unitPrice:'1',allocationMode:'auto'}],discountAmount:'0.00',roundOffAmount:'0.00'}});assert.equal(d.statusCode,201,d.body);const order=d.json();const c=await f.app.inject({method:'POST',url:`/api/v1/orders/${order.id}/confirm`,headers:writeHeaders(f.credentials),payload:{expectedVersion:order.version}});assert.equal(c.statusCode,200,c.body);
  const noCost=(value:unknown):void=>{if(Array.isArray(value))value.forEach(noCost);else if(value&&typeof value==='object')for(const [key,child] of Object.entries(value)){assert.ok(!/cost|grossProfit|profit|inputUnitCost/i.test(key),key);noCost(child);}};
  for(const url of ['/api/v1/orders',`/api/v1/orders/${order.id}`,`/api/v1/orders/${order.id}/revisions/${c.json().revisionId}`,`/api/v1/orders/${order.id}/revisions`]){const response=await f.app.inject({url,headers:{cookie:employee.cookie}});assert.equal(response.statusCode,200,response.body);noCost(response.json());}
  for(const url of [`/api/v1/orders/${order.id}/returns`,`/api/v1/returns/${randomUUID()}`]){const response=await f.app.inject({url,headers:{cookie:employee.cookie}});assert.equal(response.statusCode,403,response.body);noCost(response.json());}
  for(const [url,payload] of [[`/api/v1/orders/${order.id}/revisions`,{expectedVersion:2,reason:'拒绝',lineChanges:[]}],['/api/v1/orders/quote',{customerId:f.customer.id,lines:[],discountAmount:'0.00',roundOffAmount:'0.00'}]] as const){const response=await f.app.inject({method:'POST',url,headers:writeHeaders(employee),payload});assert.equal(response.statusCode,403,response.body);noCost(response.json());}
 }finally{await f.cleanup();}
});

test('manual original segments, full cumulative credit, discount pennies and repeated partial restocks conserve originals',async()=>{
 const f=await fixture();try{
  await f.operation(context=>createReceipt(context,{kind:'purchase',warehouseId:f.warehouse.id,receivedAt:'2026-01-02T00:00:00Z',lines:[{productId:f.product.id,unitId:f.product.baseUnitId,quantity:12,unitCost:'0.01'}]}));
  const payload={customerId:f.customer.id,lines:[{clientLineId:'penny',productId:f.product.id,warehouseId:f.warehouse.id,unitId:f.product.baseUnitId,quantity:25,unitPrice:'0.01',allocationMode:'auto'}],discountAmount:'0.01',roundOffAmount:'0.01'};
  const invalid=await f.app.inject({method:'POST',url:'/api/v1/orders',headers:writeHeaders(f.credentials),payload:{...payload,discountAmount:'0.26'}});assert.equal(invalid.statusCode,422,invalid.body);assert.equal((await f.pool.query('SELECT count(*) FROM sales_orders')).rows[0].count,'0');
  const d=(await f.app.inject({method:'POST',url:'/api/v1/orders',headers:writeHeaders(f.credentials),payload})).json();const c=await f.app.inject({method:'POST',url:`/api/v1/orders/${d.id}/confirm`,headers:writeHeaders(f.credentials),payload:{expectedVersion:d.version}});assert.equal(c.statusCode,200,c.body);let order=parseSchema('OrderAdmin',c.json());assert.equal(order.totalAmount,'0.23');assert.equal(order.costAmount,'10.01');assert.equal(order.lines[0]!.allocations.length,2);
  let credit=0n,cost=0n;const returns=[];
  for(const [index,q] of [1,1,23].entries()){
   const headers=writeHeaders(f.credentials);const input={expectedVersion:order.version,reason:'逐次全退',lines:[{lineId:order.lines[0]!.id,quantityBase:q,...(index===0?{allocationSelections:[{saleAllocationId:order.lines[0]!.allocations[0]!.id,quantityBase:1}]}:{})}]};
   const r=await f.app.inject({method:'POST',url:`/api/v1/orders/${d.id}/returns`,headers,payload:input});assert.equal(r.statusCode,201,r.body);const ret=parseSchema('SalesReturn',r.json());returns.push(ret);credit+=BigInt(ret.returnAmount.replace('.',''));cost+=BigInt(ret.costCreditAmount.replace('.',''));if(index===0)assert.equal(ret.lines[0]!.allocations[0]!.saleAllocationId,order.lines[0]!.allocations[0]!.id);if(index===1)assert.equal(ret.lines[0]!.allocations[0]!.saleAllocationId,order.lines[0]!.allocations[1]!.id);
   const replay=await f.app.inject({method:'POST',url:`/api/v1/orders/${d.id}/returns`,headers,payload:input});assert.equal(replay.headers['idempotency-replayed'],'true');assert.deepEqual(replay.json(),ret);
   order=parseSchema('OrderAdmin',(await f.app.inject({url:`/api/v1/orders/${d.id}`,headers:{cookie:f.credentials.cookie}})).json());
  }
  assert.equal(credit,23n);assert.equal(cost,1001n);assert.equal(order.returnAmount,'0.23');assert.equal((await f.pool.query('SELECT net_balance FROM customer_accounts WHERE customer_id=$1',[f.customer.id])).rows[0].net_balance,'0.00');
  const over=await f.app.inject({method:'POST',url:`/api/v1/orders/${d.id}/returns`,headers:writeHeaders(f.credentials),payload:{expectedVersion:order.version,reason:'已全退',lines:[{lineId:order.lines[0]!.id,quantityBase:1}]}});assert.equal(over.statusCode,422,over.body);
  for(const ret of returns){const headers=writeHeaders(f.credentials);const input={expectedVersion:ret.version,restockedAt:new Date().toISOString(),lines:ret.lines.flatMap(l=>l.allocations.map(a=>({returnAllocationId:a.id,quantityBase:a.quantityBase})))};const response=await f.app.inject({method:'POST',url:`/api/v1/returns/${ret.id}/restocks`,headers,payload:input});assert.equal(response.statusCode,201,response.body);const replay=await f.app.inject({method:'POST',url:`/api/v1/returns/${ret.id}/restocks`,headers,payload:input});assert.equal(replay.headers['idempotency-replayed'],'true');assert.deepEqual(replay.json(),response.json());}
  const balance=(await f.pool.query('SELECT quantity_base,cost_amount FROM stock_balances WHERE warehouse_id=$1',[f.warehouse.id])).rows[0];assert.equal(balance.quantity_base,'36');assert.equal(balance.cost_amount,'10.12');assert.equal((await f.pool.query('SELECT count(*) FROM inventory_loss_entries')).rows[0].count,'0');
 }finally{await f.cleanup();}
});

test('warehouse revision affects only selected line; actual refund never substitutes for physical restock',async()=>{
 const f=await fixture();try{
  const d=(await f.app.inject({method:'POST',url:'/api/v1/orders',headers:writeHeaders(f.credentials),payload:{customerId:f.customer.id,lines:[{clientLineId:'move',productId:f.product.id,warehouseId:f.warehouse.id,unitId:f.product.baseUnitId,quantity:1,unitPrice:'1',allocationMode:'auto'},{clientLineId:'keep',productId:f.product.id,warehouseId:f.warehouse.id,unitId:f.product.baseUnitId,quantity:1,unitPrice:'1',allocationMode:'auto'}],discountAmount:'0.00',roundOffAmount:'0.00'}})).json();
  const c=await f.app.inject({method:'POST',url:`/api/v1/orders/${d.id}/confirm`,headers:writeHeaders(f.credentials),payload:{expectedVersion:d.version}});assert.equal(c.statusCode,200,c.body);const order=parseSchema('OrderAdmin',c.json());
  const revised=await f.app.inject({method:'POST',url:`/api/v1/orders/${d.id}/revisions`,headers:writeHeaders(f.credentials),payload:{expectedVersion:order.version,reason:'仅首行移副仓',lineChanges:[{op:'set',lineId:order.lines[0]!.id,warehouseId:f.secondWarehouse.id}]}});assert.equal(revised.statusCode,201,revised.body);const next=parseSchema('OrderAdmin',revised.json());assert.deepEqual(next.lines[1]!.allocations,order.lines[1]!.allocations);assert.equal(next.lines[0]!.allocations[0]!.warehouseId,f.secondWarehouse.id);assert.equal(next.lines[0]!.costAmount,'0.50');assert.equal((await f.pool.query('SELECT quantity_base FROM stock_balances WHERE warehouse_id=$1',[f.warehouse.id])).rows[0].quantity_base,'23');
  const {recordCash}=await import('../src/modules/finance/cash.js');await f.operation(context=>recordCash(context,{customerId:f.customer.id,kind:'receipt',amount:'2.00',occurredAt:new Date().toISOString(),method:'cash',allocationMode:'auto'}));
  const r=await f.app.inject({method:'POST',url:`/api/v1/orders/${d.id}/returns`,headers:writeHeaders(f.credentials),payload:{expectedVersion:next.version,reason:'已付款退第一行',lines:[{lineId:next.lines[0]!.id,quantityBase:1}]}});assert.equal(r.statusCode,201,r.body);const ret=parseSchema('SalesReturn',r.json());
  const before=(await f.pool.query('SELECT count(*) FROM stock_movements')).rows[0].count;const commercial=(await f.pool.query("SELECT count(*) FROM customer_ledger_entries WHERE category IN ('sale','return')")).rows[0].count;
  await f.operation(context=>recordCash(context,{customerId:f.customer.id,kind:'refund',amount:'1.00',occurredAt:new Date().toISOString(),method:'cash',relatedReturnId:ret.id}));
  assert.equal((await f.pool.query('SELECT count(*) FROM stock_movements')).rows[0].count,before);assert.equal((await f.pool.query("SELECT count(*) FROM customer_ledger_entries WHERE category IN ('sale','return')")).rows[0].count,commercial);
  const read=await f.app.inject({url:`/api/v1/returns/${ret.id}`,headers:{cookie:f.credentials.cookie}});assert.equal(read.json().refundedAmount,'1.00');assert.equal(read.json().lines[0].restockedQuantityBase,0);
  const restock=await f.app.inject({method:'POST',url:`/api/v1/returns/${ret.id}/restocks`,headers:writeHeaders(f.credentials),payload:{expectedVersion:ret.version,restockedAt:new Date().toISOString(),lines:[{returnAllocationId:ret.lines[0]!.allocations[0]!.id,quantityBase:1}]}});assert.equal(restock.statusCode,201,restock.body);assert.equal((await f.pool.query('SELECT quantity_base,cost_amount FROM stock_balances WHERE warehouse_id=$1',[f.secondWarehouse.id])).rows[0].quantity_base,'12');assert.equal((await f.pool.query('SELECT count(*) FROM cash_events')).rows[0].count,'2');
 }finally{await f.cleanup();}
});
