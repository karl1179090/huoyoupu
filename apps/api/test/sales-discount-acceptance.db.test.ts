import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSchema} from '@huoyoupu/contracts';
import {apiFixture,writeHeaders} from './helpers.js';
test('independent penny regression keeps original subtotal after discounted return followed by quantity reduction',async()=>{
 const f=await apiFixture();try{
  const credentials=await f.login();
  const post=async(url:string,payload:Record<string,unknown>,status=201)=>{const r=await f.app.inject({method:'POST',url,headers:writeHeaders(credentials),payload});assert.equal(r.statusCode,status,r.body);return r.json();};
  const customer=await post('/api/v1/customers',{code:'PENNY-C',name:'分值验收客户'});await post(`/api/v1/customers/${customer.id}/addresses`,{contactName:'测试',address:'虚构地址',isDefault:true});
  const product=await post('/api/v1/products',{code:'PENNY-P',name:'分值商品',baseUnit:{name:'瓶',defaultSalePrice:'1'}}),warehouse=await post('/api/v1/warehouses',{code:'PENNY-W',name:'验收仓'});
  await post('/api/v1/receipts',{kind:'opening',warehouseId:warehouse.id,receivedAt:'2026-01-01T00:00:00Z',lines:[{productId:product.id,unitId:product.baseUnitId,quantity:12,unitCost:'0.01'}]});
  const draft=await post('/api/v1/orders',{customerId:customer.id,lines:[{clientLineId:'discount',productId:product.id,warehouseId:warehouse.id,unitId:product.baseUnitId,quantity:12,unitPrice:'1',allocationMode:'auto'}],discountAmount:'1.50',roundOffAmount:'0.00'});
  const order=parseSchema('OrderAdmin',await post(`/api/v1/orders/${draft.id}/confirm`,{expectedVersion:draft.version},200));assert.equal(order.totalAmount,'10.50');
  const returned=parseSchema('SalesReturn',await post(`/api/v1/orders/${order.id}/returns`,{expectedVersion:order.version,reason:'退3瓶锁原来源',lines:[{lineId:order.lines[0]!.id,quantityBase:3}]}));assert.equal(returned.returnAmount,'2.63');
  const revised=parseSchema('OrderAdmin',await post(`/api/v1/orders/${order.id}/revisions`,{expectedVersion:returned.orderVersion,reason:'总数减1瓶',lineChanges:[{op:'set',lineId:order.lines[0]!.id,quantity:11}]}));
  assert.equal(revised.subtotalAmount,'11.00');assert.equal(revised.totalAmount,'9.50');const history=revised.lines.find(line=>line.readOnly)!;assert.equal(history.subtotalAmount,'3.00');assert.equal(history.discountAllocatedAmount,'0.37');assert.equal(history.netAmount,'2.63');
  assert.equal((await f.pool.query('SELECT net_balance::text FROM customer_accounts WHERE customer_id=$1',[customer.id])).rows[0].net_balance,'6.87');
 }finally{await f.cleanup();}
});
