import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {withTransaction} from '@huoyoupu/database';
import {parseSchema} from '@huoyoupu/contracts';
import type {OperationContext} from '../src/lib/security.js';
import * as catalog from '../src/modules/catalog/service.js';
import {createReceipt,createStocktake,patchStocktake,confirmStocktake} from '../src/modules/inventory/service.js';
import {apiFixture,writeHeaders} from './helpers.js';

test('real confirmed sales retain revision costs and profit after stocktake gain and loss',async()=>{
 const f=await apiFixture();
 try{
  const credentials=await f.login();
  const operation=<T>(work:(context:OperationContext)=>Promise<T>)=>withTransaction(f.pool,async client=>{
   const operationId=randomUUID();await client.query('INSERT INTO business_operations(id,kind,actor_id) VALUES($1,$2,$3)',[operationId,'stocktake_sales_test',f.admin.id]);
   return work({client,actor:f.admin,operationId});
  });
  const product=await withTransaction(f.pool,client=>catalog.createProduct(client,{code:'PROFIT',name:'毛利隔离商品',baseUnit:{name:'瓶',defaultSalePrice:'5'}}));
  const warehouse=await withTransaction(f.pool,client=>catalog.createWarehouse(client,{code:'PROFIT-W',name:'测试仓'}));
  const customer=await withTransaction(f.pool,client=>catalog.createCustomer(client,{code:'PROFIT-C',name:'虚构客户'}));
  const address=await withTransaction(f.pool,client=>catalog.createAddress(client,customer.id,{contactName:'虚构联系人',address:'测试地址',isDefault:true}));
  const receipt=await operation(context=>createReceipt(context,{kind:'purchase',warehouseId:warehouse.id,receivedAt:'2026-01-01T00:00:00Z',lines:[{productId:product.id,unitId:product.baseUnitId,quantity:10,unitCost:'2'}]}));
  const draftResponse=await f.app.inject({method:'POST',url:'/api/v1/orders',headers:writeHeaders(credentials),payload:{customerId:customer.id,addressId:address.id,lines:[{clientLineId:'sold',productId:product.id,warehouseId:warehouse.id,unitId:product.baseUnitId,quantity:2,unitPrice:'5',allocationMode:'auto'}],discountAmount:'0.00',roundOffAmount:'0.00'}});
  assert.equal(draftResponse.statusCode,201,draftResponse.body);const draft=parseSchema('OrderAdmin',draftResponse.json());
  const confirmedResponse=await f.app.inject({method:'POST',url:`/api/v1/orders/${draft.id}/confirm`,headers:writeHeaders(credentials),payload:{expectedVersion:draft.version}});
  assert.equal(confirmedResponse.statusCode,200,confirmedResponse.body);const confirmed=parseSchema('OrderAdmin',confirmedResponse.json());
  assert.equal(confirmed.totalAmount,'10.00');assert.equal(confirmed.costAmount,'4.00');assert.equal(confirmed.grossProfit,'6.00');
  const snapshot=async()=>({
   revisions:(await f.pool.query('SELECT * FROM order_revisions WHERE order_id=$1 ORDER BY revision_no',[confirmed.id])).rows,
   lines:(await f.pool.query('SELECT l.* FROM revision_lines l JOIN order_revisions r ON r.id=l.revision_id WHERE r.order_id=$1 ORDER BY l.id',[confirmed.id])).rows,
   sources:(await f.pool.query('SELECT * FROM sale_allocations WHERE order_id=$1 ORDER BY id',[confirmed.id])).rows,
   ledger:(await f.pool.query('SELECT * FROM customer_ledger_entries WHERE order_id=$1 ORDER BY id',[confirmed.id])).rows,
  });
  const before=await snapshot();
  // First lose two units from the original eight remaining; then gain one at a new cost.
  for(const actualQuantityBase of [6,7]){
   let count=await operation(context=>createStocktake(context,{warehouseId:warehouse.id,lines:[{productId:product.id,batchId:receipt.lines[0]!.batchId}]}));
   count=await operation(context=>patchStocktake(context,count.id,{expectedVersion:count.version,lines:[{id:count.lines[0]!.id,actualQuantityBase,...(actualQuantityBase===7?{gainCostUnitId:product.baseUnitId,gainUnitCost:'9'}:{})}]}));
   await operation(context=>confirmStocktake(context,count.id,count.version));
   assert.deepEqual(await snapshot(),before);
   const current=await f.app.inject({url:`/api/v1/orders/${confirmed.id}`,headers:{cookie:credentials.cookie}});
   assert.equal(current.statusCode,200,current.body);const order=parseSchema('OrderAdmin',current.json());
   assert.equal(order.revisionId,confirmed.revisionId);assert.equal(order.costAmount,'4.00');assert.equal(order.grossProfit,'6.00');assert.deepEqual(order.lines,confirmed.lines);
  }
  const losses=await f.pool.query('SELECT source_kind,amount::text FROM inventory_loss_entries ORDER BY amount');
  assert.deepEqual(losses.rows,[{source_kind:'stocktake_loss',amount:'-4.00'},{source_kind:'stocktake_gain',amount:'9.00'}]);
  const balance=await f.pool.query('SELECT quantity_base::text,cost_amount::text FROM stock_balances WHERE product_id=$1 AND warehouse_id=$2',[product.id,warehouse.id]);
  assert.deepEqual(balance.rows,[{quantity_base:'7',cost_amount:'21.00'}]);
 }finally{await f.cleanup();}
});
