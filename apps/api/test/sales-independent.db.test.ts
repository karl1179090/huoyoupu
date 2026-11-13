import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSchema} from '@huoyoupu/contracts';
import {apiFixture,writeHeaders} from './helpers.js';

test('independent sales acceptance moves only the changed warehouse line and rejects failed or delivered voids atomically',async()=>{
 const f=await apiFixture();
 try{
  const credentials=await f.login();
  const post=async(url:string,payload:Record<string,unknown>,status=201)=>{const r=await f.app.inject({method:'POST',url,headers:writeHeaders(credentials),payload});assert.equal(r.statusCode,status,r.body);return r.json();};
  const customer=await post('/api/v1/customers',{code:'MOVE-C',name:'验收客户'});await post(`/api/v1/customers/${customer.id}/addresses`,{contactName:'验收',address:'虚构地址',isDefault:true});
  const product=parseSchema('Product',await post('/api/v1/products',{code:'MOVE-P',name:'换仓商品',baseUnit:{name:'瓶',defaultSalePrice:'8'}}));
  const warehouses=[];for(const code of ['A','B','EMPTY'])warehouses.push(await post('/api/v1/warehouses',{code,name:code}));
  const [a,b,empty]=warehouses;
  for(const [warehouse,cost]of [[a,'1'],[b,'5']] as const)await post('/api/v1/receipts',{kind:'purchase',warehouseId:warehouse.id,receivedAt:'2026-01-01T00:00:00Z',lines:[{productId:product.id,unitId:product.baseUnitId,quantity:10,unitCost:cost}]});
  const draft=await post('/api/v1/orders',{customerId:customer.id,lines:['move','unchanged'].map(clientLineId=>({clientLineId,productId:product.id,warehouseId:a.id,unitId:product.baseUnitId,quantity:2,unitPrice:'8',allocationMode:'auto'})),discountAmount:'0.00',roundOffAmount:'0.00'});
  let order=parseSchema('OrderAdmin',await post(`/api/v1/orders/${draft.id}/confirm`,{expectedVersion:draft.version},200));
  const unchanged=order.lines[1]!;const first=order.lines[0]!;
  const changed=parseSchema('OrderAdmin',await post(`/api/v1/orders/${order.id}/revisions`,{expectedVersion:order.version,reason:'只改首行仓库',lineChanges:[{op:'set',lineId:first.id,warehouseId:b.id}]}));
  assert.deepEqual(changed.lines[1],unchanged);assert.equal(changed.lines[0]!.warehouseId,b.id);assert.equal(changed.lines[0]!.costAmount,'10.00');assert.equal(changed.costAmount,'12.00');
  const balance=async()=>(await f.pool.query('SELECT warehouse_id,quantity_base,cost_amount FROM stock_balances ORDER BY warehouse_id')).rows;
  const before=await balance();assert.equal(Number(before.find(row=>row.warehouse_id===a.id).quantity_base),8);assert.equal(Number(before.find(row=>row.warehouse_id===b.id).quantity_base),8);
  const sources=(await f.pool.query('SELECT * FROM sale_allocations ORDER BY id')).rows;
  await post(`/api/v1/orders/${order.id}/revisions`,{expectedVersion:changed.version,reason:'空仓应整体失败',lineChanges:[{op:'set',lineId:first.id,warehouseId:empty.id}]},409);
  assert.deepEqual(await balance(),before);assert.deepEqual((await f.pool.query('SELECT * FROM sale_allocations ORDER BY id')).rows,sources);
  const stale=await post(`/api/v1/orders/${order.id}/revisions`,{expectedVersion:order.version,reason:'旧版本不可覆盖',lineChanges:[]},409);assert.equal(stale.code,'VERSION_CONFLICT');
  order=parseSchema('OrderAdmin',await post(`/api/v1/orders/${order.id}/delivery`,{expectedVersion:changed.version,deliveryStatus:'delivered'},200));
  const denied=await post(`/api/v1/orders/${order.id}/void`,{expectedVersion:order.version,reason:'已配送不可作废'},409);assert.equal(denied.code,'ORDER_STATE_CONFLICT');assert.deepEqual(await balance(),before);
  const revised=parseSchema('OrderAdmin',await post(`/api/v1/orders/${order.id}/revisions`,{expectedVersion:order.version,reason:'配送后仍可改价',lineChanges:[{op:'set',lineId:first.id,unitPrice:'9'}]}));assert.equal(revised.deliveryStatus,'delivered');assert.equal(revised.costAmount,'12.00');assert.deepEqual(await balance(),before);
 }finally{await f.cleanup();}
});
