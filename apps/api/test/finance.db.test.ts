import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {parseMoney} from '@huoyoupu/money';
import {parseSchema,type components} from '@huoyoupu/contracts';
import {apiFixture,writeHeaders} from './helpers.js';

test('finance actual cash, credit origin, concurrent refunds, immutable statements and safe reversals',async t=>{
 const f=await apiFixture();
 try{
  const credentials=await f.login();
  const post=async(url:string,payload:Record<string,unknown>,status=201,key=randomUUID())=>{
   const r=await f.app.inject({method:'POST',url,headers:writeHeaders(credentials,key),payload});assert.equal(r.statusCode,status,r.body);return r;
  };
  const customer=(await post('/api/v1/customers',{code:'FIN',name:'财务虚构客户'})).json();
  const balanceUrl=`/api/v1/customers/${customer.id}/balance`;
  const balance=async()=>parseSchema('CustomerBalance',(await f.app.inject({url:balanceUrl,headers:{cookie:credentials.cookie}})).json());
  let receipt:components['schemas']['CashEvent'],statement:components['schemas']['Statement'];
  await t.test('opening credit and actual receipt are distinct sources and a repeated key never doubles cash',async()=>{
   const opening=await post(`/api/v1/customers/${customer.id}/opening-balance`,{amount:'-10.00',effectiveAt:'2025-12-31T16:00:00Z',reason:'切换期初'});assert.equal(opening.json().creditBalance,'10.00');
   await post(`/api/v1/customers/${customer.id}/opening-balance`,{amount:'-1.00',effectiveAt:'2025-12-31T16:00:00Z',reason:'重复'},409);
   const key=randomUUID(),payload={kind:'receipt',customerId:customer.id,amount:'20.00',occurredAt:'2026-01-10T00:00:00Z',method:'cash',allocationMode:'manual'};
   const r=await post('/api/v1/cash-events',payload,201,key);receipt=parseSchema('CashEvent',r.json());
   const replay=await post('/api/v1/cash-events',payload,201,key);assert.deepEqual(replay.json(),receipt);assert.equal(replay.headers['idempotency-replayed'],'true');
   assert.equal((await balance()).netBalance,'-30.00');assert.equal((await balance()).unallocatedAmount,'30.00');
   assert.equal((await f.pool.query('SELECT count(*) FROM cash_events')).rows[0].count,'1');
  });
  await t.test('statement fixes left-closed right-open rows and opening separate from actual receipts',async()=>{
   statement=parseSchema('Statement',(await post(`/api/v1/customers/${customer.id}/statements`,{periodStart:'2025-12-31T16:00:00Z',periodEnd:'2026-01-31T16:00:00Z'})).json());
   assert.equal(statement.openingBalance,'-10.00');assert.equal(statement.receiptAmount,'20.00');assert.equal(statement.salesAmount,'0.00');assert.equal(statement.closingBalance,'-30.00');assert.equal(statement.stale,false);
   const page=parseSchema('Statement',(await f.app.inject({url:`/api/v1/statements/${statement.id}?limit=1`,headers:{cookie:credentials.cookie}})).json());assert.equal(page.rows.length,1);assert.ok(page.nextCursor);
   const next=parseSchema('Statement',(await f.app.inject({url:`/api/v1/statements/${statement.id}?cursor=${page.nextCursor}`,headers:{cookie:credentials.cookie}})).json());assert.equal(next.rows.length,1);assert.notEqual(next.rows[0]!.id,page.rows[0]!.id);
  });
  await t.test('ledger pages preserve exact registration-time precision and reject cursors for another customer',async()=>{
   const ids:string[]=[];let cursor:string|null=null;let firstCursor:string|null=null;
   do{const r:{statusCode:number;body:string;json():unknown}=await f.app.inject({url:`/api/v1/customers/${customer.id}/ledger?limit=1${cursor?'&cursor='+cursor:''}`,headers:{cookie:credentials.cookie}});assert.equal(r.statusCode,200,r.body);const page=parseSchema('LedgerPage',r.json());ids.push(...page.items.map(row=>row.id));cursor=page.nextCursor;if(!firstCursor)firstCursor=cursor;assert.ok(ids.length<=2);}while(cursor);
   assert.equal(ids.length,2);assert.equal(new Set(ids).size,2);
   const other=(await post('/api/v1/customers',{code:'CURSOR',name:'游标隔离客户'})).json();const invalid=await f.app.inject({url:`/api/v1/customers/${other.id}/ledger?cursor=${firstCursor}`,headers:{cookie:credentials.cookie}});assert.equal(invalid.statusCode,400);
  });
  await t.test('concurrent actual refunds serialize against net credit and retain sources',async()=>{
   const payload={kind:'refund',customerId:customer.id,amount:'20.00',occurredAt:'2026-02-01T00:00:00Z',method:'bank_transfer'};
   const results=await Promise.all([1,2].map(()=>f.app.inject({method:'POST',url:'/api/v1/cash-events',headers:writeHeaders(credentials),payload})));
   assert.deepEqual(results.map(r=>r.statusCode).sort(),[201,422]);assert.equal((await balance()).netBalance,'-10.00');
   const success=results.find(r=>r.statusCode===201)!;const refund=parseSchema('CashEvent',success.json());assert.equal(refund.allocations.reduce((sum,row)=>sum+parseMoney(row.amount),0n),2000n);
   const old=parseSchema('Statement',(await f.app.inject({url:`/api/v1/statements/${statement.id}`,headers:{cookie:credentials.cookie}})).json());assert.equal(old.stale,false);assert.equal(old.closingBalance,'-30.00');
   await post(`/api/v1/cash-events/${receipt.id}/reverse`,{expectedVersion:receipt.version,reason:'已有退款来源应保护'},409);
   const reversed=parseSchema('CashEvent',(await post(`/api/v1/cash-events/${refund.id}/reverse`,{expectedVersion:refund.version,reason:'纠正错误退款'},200)).json());assert.equal(reversed.status,'reversed');assert.equal((await balance()).netBalance,'-30.00');
  });
  await t.test('backdated correction marks old snapshot stale but leaves its rows and totals immutable',async()=>{
   const reversed=parseSchema('CashEvent',(await post(`/api/v1/cash-events/${receipt.id}/reverse`,{expectedVersion:receipt.version,reason:'纠正错误收款'},200)).json());assert.equal(reversed.status,'reversed');
   assert.equal((await balance()).netBalance,'-10.00');
   const old=parseSchema('Statement',(await f.app.inject({url:`/api/v1/statements/${statement.id}`,headers:{cookie:credentials.cookie}})).json());assert.equal(old.stale,true);assert.equal(old.closingBalance,'-30.00');assert.deepEqual(old.rows,statement.rows);
   const fresh=parseSchema('Statement',(await post(`/api/v1/customers/${customer.id}/statements`,{periodStart:'2025-12-31T16:00:00Z',periodEnd:'2026-01-31T16:00:00Z'})).json());assert.equal(fresh.closingBalance,'-10.00');assert.equal(fresh.receiptAmount,'0.00');assert.notEqual(fresh.id,statement.id);
   assert.equal((await f.pool.query('SELECT count(*) FROM cash_events')).rows[0].count,'2');assert.equal((await f.pool.query('SELECT count(*) FROM cash_reversals')).rows[0].count,'2');
   await assert.rejects(f.pool.query('DELETE FROM customer_ledger_entries'));
   await assert.rejects(f.pool.query('UPDATE statement_snapshots SET closing_balance=0'));
  });
 }finally{await f.cleanup();}
});

test('finance allocates actual receipts once across orders and reclassifies commercial history without moving cash',async()=>{
 const f=await apiFixture();
 try{
  const credentials=await f.login();
  const post=async(url:string,payload:Record<string,unknown>,status=201)=>{const r=await f.app.inject({method:'POST',url,headers:writeHeaders(credentials),payload});assert.equal(r.statusCode,status,r.body);return r.json();};
  const a=await post('/api/v1/customers',{code:'A',name:'甲'}),b=await post('/api/v1/customers',{code:'B',name:'乙'});
  await post(`/api/v1/customers/${a.id}/addresses`,{contactName:'甲联系人',address:'甲地址',isDefault:true});await post(`/api/v1/customers/${b.id}/addresses`,{contactName:'乙联系人',address:'乙地址',isDefault:true});
  const product=await post('/api/v1/products',{code:'P',name:'商品',baseUnit:{name:'瓶',defaultSalePrice:'10'}}),warehouse=await post('/api/v1/warehouses',{code:'W',name:'仓'});
  await post('/api/v1/receipts',{kind:'opening',warehouseId:warehouse.id,receivedAt:'2026-01-01T00:00:00Z',lines:[{productId:product.id,unitId:product.baseUnitId,quantity:100,unitCost:'3'}]});
  const secondAddress=await post(`/api/v1/customers/${a.id}/addresses`,{contactName:'甲第二联系人',address:'甲第二地址',isDefault:false});
  const order=async(customerId:string,quantity=1,addressId?:string)=>{const draft=await post('/api/v1/orders',{customerId,...(addressId?{addressId}:{}),lines:[{clientLineId:randomUUID(),productId:product.id,warehouseId:warehouse.id,unitId:product.baseUnitId,quantity,unitPrice:'10',allocationMode:'auto'}],discountAmount:'0.00',roundOffAmount:'0.00'});return post(`/api/v1/orders/${draft.id}/confirm`,{expectedVersion:draft.version},200);};
  const first=await order(a.id),second=await order(a.id,2,secondAddress.id),other=await order(b.id);
  const receipt=await post('/api/v1/cash-events',{kind:'receipt',customerId:a.id,amount:'15.00',occurredAt:'2026-01-01T00:00:00Z',method:'cash',allocationMode:'auto'});
  assert.deepEqual(receipt.allocations.map((x:components['schemas']['AllocationReadCash'])=>[x.orderId,x.amount]),[[first.id,'10.00'],[second.id,'5.00']]);
  await post('/api/v1/cash-events',{kind:'receipt',customerId:a.id,amount:'1.00',occurredAt:'2026-01-02T00:00:00Z',method:'cash',allocationMode:'manual',allocations:[{orderId:other.id,amount:'1.00'}]},422);
  const excess=await post('/api/v1/cash-events',{kind:'receipt',customerId:a.id,amount:'20.00',occurredAt:'2026-01-02T00:00:00Z',method:'cash',allocationMode:'manual',allocations:[{orderId:second.id,amount:'10.00'}]});
  assert.equal(excess.balance.netBalance,'-5.00');assert.equal(excess.balance.unallocatedAmount,'10.00');
  const cashBefore=(await f.pool.query('SELECT count(*) FROM cash_events')).rows[0].count;
  const applied=await post(`/api/v1/customers/${a.id}/balance-applications`,{expectedVersion:excess.balance.version,allocations:[{orderId:second.id,amount:'5.00'}]});assert.equal(applied.unallocatedAmount,'5.00');
  assert.equal((await f.pool.query('SELECT count(*) FROM cash_events')).rows[0].count,cashBefore);
  // The same transaction port used by revise/return: preserve each source business date.
  const {withTransaction}=await import('@huoyoupu/database');
  const {financePort}=await import('../src/modules/finance/core.js');
  await withTransaction(f.pool,async client=>{
   await client.query('SELECT id FROM sales_orders WHERE id=$1 FOR UPDATE',[first.id]);await financePort.lockAccounts(client,[a.id,b.id]);
   const sources=await financePort.listCommercial(client,first.id,a.id);const original=sources[0]!;
   const operationId=randomUUID();await client.query('INSERT INTO business_operations(id,kind,actor_id) VALUES($1,\'finance_acceptance\',$2)',[operationId,f.admin.id]);
   await client.query('UPDATE sales_orders SET customer_id=$2 WHERE id=$1',[first.id,b.id]);
   await financePort.applyCommercial(client,{operationId,actorId:f.admin.id,orderId:first.id,changes:[{...original,kind:'reversal',amountSigned:-original.amountSigned,reversesId:original.id},{...original,customerId:b.id,kind:'reclassification',reclassifiesId:original.id}]});
  });
  const cash=(await f.pool.query('SELECT customer_id,amount::text,occurred_at FROM cash_events ORDER BY occurred_at')).rows;
  assert.equal(cash.length,2);assert.ok(cash.every(row=>row.customer_id===a.id));assert.equal(cash[0].amount,'15.00');
  const totals=(await f.pool.query('SELECT customer_id,net_balance::text FROM customer_accounts ORDER BY customer_id')).rows;
  assert.equal(totals.find(row=>row.customer_id===a.id).net_balance,'-15.00');assert.equal(totals.find(row=>row.customer_id===b.id).net_balance,'20.00');
  assert.equal((await f.pool.query("SELECT sum(CASE WHEN kind='allocate' THEN amount ELSE -amount END)::text AS amount FROM settlement_allocations WHERE target_order_id=$1",[first.id])).rows[0].amount,'0.00');
  const history=(await f.pool.query('SELECT effective_at FROM customer_ledger_entries WHERE order_id=$1',[first.id])).rows;assert.equal(new Set(history.map(row=>row.effective_at.toISOString())).size,1);
  // Real sales HTTP: paid order drops in price, then returns, then voids.
  const revised=await post(`/api/v1/orders/${second.id}/revisions`,{expectedVersion:second.version,reason:'降价释放多收款',lineChanges:[{op:'set',lineId:second.lines[0].id,unitPrice:'5'}]});
  assert.equal(revised.totalAmount,'10.00');
  let paid=(await f.pool.query("SELECT sum(CASE WHEN kind='allocate' THEN amount ELSE -amount END)::text AS amount FROM settlement_allocations WHERE target_order_id=$1",[second.id])).rows[0].amount;assert.equal(paid,'10.00');
  const returned=await post(`/api/v1/orders/${second.id}/returns`,{expectedVersion:revised.version,reason:'未另退款退一瓶',lines:[{lineId:revised.lines[0].id,quantityBase:1}]});
  paid=(await f.pool.query("SELECT sum(CASE WHEN kind='allocate' THEN amount ELSE -amount END)::text AS amount FROM settlement_allocations WHERE target_order_id=$1",[second.id])).rows[0].amount;assert.equal(paid,'5.00');
  const current=(await f.app.inject({url:`/api/v1/orders/${second.id}`,headers:{cookie:credentials.cookie}})).json();
  await post(`/api/v1/orders/${second.id}/void`,{expectedVersion:current.version,reason:'取消剩余有效段'},200);
  paid=(await f.pool.query("SELECT sum(CASE WHEN kind='allocate' THEN amount ELSE -amount END)::text AS amount FROM settlement_allocations WHERE target_order_id=$1",[second.id])).rows[0].amount;assert.equal(paid,'0.00');
  assert.equal((await f.pool.query('SELECT count(*) FROM cash_events')).rows[0].count,cashBefore);
  assert.equal(returned.returnAmount,'5.00');
  // Separate port fixture: January sale and February return must remain in their own months.
  const historical=await post('/api/v1/orders',{customerId:a.id,lines:[{clientLineId:'historical',productId:product.id,warehouseId:warehouse.id,unitId:product.baseUnitId,quantity:5,unitPrice:'10',allocationMode:'auto'}],discountAmount:'0.00',roundOffAmount:'0.00'});
  const operation=async(work:(client:import('pg').PoolClient,operationId:string)=>Promise<void>)=>withTransaction(f.pool,async client=>{const operationId=randomUUID();await client.query('INSERT INTO business_operations(id,kind,actor_id) VALUES($1,\'finance_port_fixture\',$2)',[operationId,f.admin.id]);await work(client,operationId);});
  await operation(async(client,operationId)=>{await client.query("UPDATE sales_orders SET status='confirmed',confirmed_at='2026-01-10' WHERE id=$1",[historical.id]);await financePort.applyCommercial(client,{operationId,actorId:f.admin.id,orderId:historical.id,changes:[{customerId:a.id,kind:'sale',sourceId:historical.id,sourceVersion:1,amountSigned:5000n,effectiveAt:new Date('2026-01-10')},{customerId:a.id,kind:'return',sourceId:randomUUID(),sourceVersion:1,amountSigned:-1000n,effectiveAt:new Date('2026-02-10')}]});});
  await operation(async(client,operationId)=>{await client.query('SELECT id FROM sales_orders WHERE id=$1 FOR UPDATE',[historical.id]);await financePort.lockAccounts(client,[a.id,b.id]);const sources=await financePort.listCommercial(client,historical.id,a.id);await client.query('UPDATE sales_orders SET customer_id=$2 WHERE id=$1',[historical.id,b.id]);await financePort.applyCommercial(client,{operationId,actorId:f.admin.id,orderId:historical.id,changes:sources.flatMap(source=>[{...source,kind:'reversal' as const,amountSigned:-source.amountSigned,reversesId:source.id},{...source,customerId:b.id,kind:'reclassification' as const,reclassifiesId:source.id}])});});
  const months=(await f.pool.query("SELECT customer_id,to_char(effective_at,'YYYY-MM') AS month,sum(amount_signed)::text AS amount FROM customer_ledger_entries WHERE order_id=$1 GROUP BY customer_id,month",[historical.id])).rows;
  assert.equal(months.find(row=>row.customer_id===b.id&&row.month==='2026-01').amount,'50.00');assert.equal(months.find(row=>row.customer_id===b.id&&row.month==='2026-02').amount,'-10.00');assert.ok(months.filter(row=>row.customer_id===a.id).every(row=>row.amount==='0.00'));
  assert.equal((await f.pool.query('SELECT count(*) FROM cash_events')).rows[0].count,cashBefore);
  const check=(await f.pool.query('SELECT a.customer_id FROM customer_accounts a WHERE a.net_balance<>(SELECT COALESCE(sum(e.amount_signed),0) FROM customer_ledger_entries e WHERE e.customer_id=a.customer_id)')).rows;assert.equal(check.length,0);
  const stockBefore=(await f.pool.query('SELECT * FROM stock_balances ORDER BY product_id,warehouse_id')).rows;
  const commercialBefore=(await f.pool.query("SELECT * FROM customer_ledger_entries WHERE category IN ('sale','return') ORDER BY id")).rows;
  for(const amount of ['10.00','20.00'])await post('/api/v1/cash-events',{kind:'refund',customerId:a.id,amount,occurredAt:new Date().toISOString(),method:'cash',relatedReturnId:returned.id});
  assert.deepEqual((await f.pool.query('SELECT * FROM stock_balances ORDER BY product_id,warehouse_id')).rows,stockBefore);
  assert.deepEqual((await f.pool.query("SELECT * FROM customer_ledger_entries WHERE category IN ('sale','return') ORDER BY id")).rows,commercialBefore);
  const unpaid=await post(`/api/v1/orders/${other.id}/returns`,{expectedVersion:other.version,reason:'未付款全退只减欠款',lines:[{lineId:other.lines[0].id,quantityBase:1}]});assert.equal(unpaid.returnAmount,'10.00');
  const bBalance=parseSchema('CustomerBalance',(await f.app.inject({url:`/api/v1/customers/${b.id}/balance`,headers:{cookie:credentials.cookie}})).json());assert.equal(bBalance.creditBalance,'0.00');assert.equal(bBalance.unallocatedAmount,'0.00');
  await post('/api/v1/cash-events',{kind:'refund',customerId:b.id,amount:'1.00',occurredAt:new Date().toISOString(),method:'cash'},422);

 }finally{await f.cleanup();}
});
