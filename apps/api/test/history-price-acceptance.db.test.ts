import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSchema} from '@huoyoupu/contracts';
import {apiFixture,writeHeaders} from './helpers.js';

test('independent price history acceptance uses same unit, original confirmation chronology, stable rows and net discounts',async()=>{
 const f=await apiFixture();
 try{
  const credentials=await f.login();
  const write=async(url:string,payload:Record<string,unknown>,status=201,method:'POST'|'PUT'='POST')=>{const r=await f.app.inject({method,url,headers:writeHeaders(credentials),payload});assert.equal(r.statusCode,status,r.body);return r.json();};
  const customer=await write('/api/v1/customers',{code:'HISTORY',name:'历史价独立验收客户'});
  const address=await write(`/api/v1/customers/${customer.id}/addresses`,{contactName:'验收联系人',address:'虚构地址',isDefault:true});
  const product=parseSchema('Product',await write('/api/v1/products',{code:'HISTORY-P',name:'验收商品',baseUnit:{name:'瓶',defaultSalePrice:'2'},units:[{name:'件',multiplierBase:12,defaultSalePrice:'24'}]}));
  const pack=product.units.find(unit=>unit.multiplierBase===12)!;
  const warehouse=await write('/api/v1/warehouses',{code:'HISTORY-W',name:'验收仓'});
  await write('/api/v1/receipts',{kind:'purchase',warehouseId:warehouse.id,receivedAt:'2026-01-01T00:00:00Z',lines:[{productId:product.id,unitId:product.baseUnitId,quantity:100,unitCost:'1'}]});
  await write(`/api/v1/customers/${customer.id}/price-rules/${product.id}/${product.baseUnitId}`,{expectedVersion:0,unitPrice:'1.5'},200,'PUT');
  const quote=async(unitId=product.baseUnitId)=>{const r=await f.app.inject({url:`/api/v1/customers/${customer.id}/price-quote?productId=${product.id}&unitId=${unitId}`,headers:{cookie:credentials.cookie}});assert.equal(r.statusCode,200,r.body);return parseSchema('PriceQuote',r.json());};
  assert.equal((await quote()).source,'customer_rule');assert.equal((await quote(pack.id)).source,'default');
  const create=async(prices:string[],quantity:number,discountAmount:string,date:string)=>{
   const draft=await write('/api/v1/orders',{customerId:customer.id,addressId:address.id,lines:prices.map((unitPrice,i)=>({clientLineId:`line-${i}`,productId:product.id,warehouseId:warehouse.id,unitId:product.baseUnitId,quantity,unitPrice,allocationMode:'auto'})),discountAmount,roundOffAmount:'0.00'});
   const order=parseSchema('OrderAdmin',await write(`/api/v1/orders/${draft.id}/confirm`,{expectedVersion:draft.version},200));
   // Controlled chronology fixture: changing later revision time must not rank this order newer.
   await f.pool.query('UPDATE sales_orders SET confirmed_at=$2 WHERE id=$1',[order.id,date]);return order;
  };
  const older=await create(['3'],2,'1.00','2026-01-10T00:00:00Z');
  let price=await quote();assert.equal(price.unitPrice,'2.500000');assert.equal(price.sourceNetAmount,'5.00');assert.equal(price.sourceOrderId,older.id);
  const newer=await create(['5','7'],1,'2.00','2026-02-10T00:00:00Z');
  price=await quote();assert.equal(price.sourceOrderId,newer.id);assert.equal(price.sourceLineId,newer.lines[1]!.id);assert.equal(price.unitPrice,'5.830000');assert.equal(price.sourceNetAmount,'5.83');assert.deepEqual(await quote(),price);
  assert.equal((await quote(pack.id)).source,'default');assert.equal((await quote(pack.id)).unitPrice,'24.000000');
  const revised=parseSchema('OrderAdmin',await write(`/api/v1/orders/${older.id}/revisions`,{expectedVersion:older.version,reason:'旧单晚改不抢最近',lineChanges:[{op:'set',lineId:older.lines[0]!.id,unitPrice:'9'}]}));
  assert.equal((await quote()).sourceOrderId,newer.id);
  await write(`/api/v1/orders/${newer.id}/returns`,{expectedVersion:newer.version,reason:'全退排除历史',lines:newer.lines.map(line=>({lineId:line.id,quantityBase:line.quantityBase}))});
  price=await quote();assert.equal(price.sourceOrderId,older.id);assert.equal(price.unitPrice,'8.500000');assert.equal(price.sourceConfirmedAt,'2026-01-10T00:00:00.000Z');
  await write(`/api/v1/orders/${older.id}/void`,{expectedVersion:revised.version,reason:'作废排除历史'},200);
  price=await quote();assert.equal(price.source,'customer_rule');assert.equal(price.unitPrice,'1.500000');assert.equal(price.sourceOrderId,null);
 }finally{await f.cleanup();}
});
