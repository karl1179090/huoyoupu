import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {withTransaction} from '../../../packages/database/src/index.js';
import {apiFixture,writeHeaders} from '../../../apps/api/test/helpers.js';
import {financePort} from '../../../apps/api/src/modules/finance/core.js';

test('independent finance: signed openings are not sales or cash, and account equals immutable ledger',async()=>{
 const f=await apiFixture();try{
  const actor=await f.login();
  for(const [code,amount] of [['POS','12.34'],['NEG','-9.87']]){
   const c=await f.app.inject({method:'POST',url:'/api/v1/customers',headers:writeHeaders(actor),payload:{code,name:`独立期初${code}`}});assert.equal(c.statusCode,201,c.body);
   const id=c.json().id;const response=await f.app.inject({method:'POST',url:`/api/v1/customers/${id}/opening-balance`,headers:writeHeaders(actor),payload:{amount,effectiveAt:'2026-01-01T00:00:00Z',reason:'独立验收正负期初'}});assert.equal(response.statusCode,201,response.body);assert.equal(response.json().netBalance,amount);
   const reconciliation=(await f.pool.query(`SELECT a.net_balance::text AS account,COALESCE(sum(l.amount_signed),0)::numeric(20,2)::text AS ledger FROM customer_accounts a LEFT JOIN customer_ledger_entries l ON l.customer_id=a.customer_id WHERE a.customer_id=$1 GROUP BY a.net_balance`,[id])).rows[0];assert.equal(reconciliation.account,amount);assert.equal(reconciliation.ledger,amount);
   assert.equal((await f.pool.query("SELECT count(*) FROM customer_ledger_entries WHERE customer_id=$1 AND category IN ('sale','return','receipt','refund')",[id])).rows[0].count,'0');
  }
  assert.equal((await f.pool.query('SELECT count(*) FROM cash_events')).rows[0].count,'0');
  await assert.rejects(f.pool.query('UPDATE customer_ledger_entries SET amount_signed=0'));
 }finally{await f.cleanup();}
});

test('independent finance: opposite caller account orders complete and same-client rollback removes new accounts',async()=>{
 const f=await apiFixture();try{
  const actor=await f.login();const ids:string[]=[];
  for(const code of ['LOCKA','LOCKB','ROLLBACK']){const r=await f.app.inject({method:'POST',url:'/api/v1/customers',headers:writeHeaders(actor),payload:{code,name:code}});assert.equal(r.statusCode,201,r.body);ids.push(r.json().id);}
  await Promise.all([ids.slice(0,2),ids.slice(0,2).reverse()].map(order=>withTransaction(f.pool,async client=>{await client.query("SET LOCAL lock_timeout='3s'");await financePort.lockAccounts(client,order);await client.query('SELECT pg_sleep(0.02)');})));
  assert.equal((await f.pool.query('SELECT count(*) FROM customer_accounts')).rows[0].count,'2');
  await assert.rejects(withTransaction(f.pool,async client=>{await financePort.lockAccounts(client,[ids[2]!]);assert.equal((await client.query('SELECT count(*) FROM customer_accounts WHERE customer_id=$1',[ids[2]])).rows[0].count,'1');throw new Error('intentional acceptance rollback');}),/intentional/);
  assert.equal((await f.pool.query('SELECT count(*) FROM customer_accounts WHERE customer_id=$1',[ids[2]])).rows[0].count,'0');
  const preview=await withTransaction(f.pool,async client=>{await client.query('SET TRANSACTION READ ONLY');return financePort.previewCommercial(client,[{customerId:ids[2]!,kind:'sale',sourceId:randomUUID(),sourceVersion:1,amountSigned:123n,effectiveAt:new Date()}]);});assert.equal(preview[0]!.beforeNetBalance,'0.00');assert.equal(preview[0]!.afterNetBalance,'1.23');assert.equal((await f.pool.query('SELECT count(*) FROM customer_accounts WHERE customer_id=$1',[ids[2]])).rows[0].count,'0');
 }finally{await f.cleanup();}
});

test('independent finance: consumed cash source cannot reverse; fixed statement pages survive a backdated write',async()=>{
 const f=await apiFixture();try{
  const actor=await f.login();const post=async(url:string,payload:unknown,status=201)=>{const r=await f.app.inject({method:'POST',url,headers:writeHeaders(actor),payload});assert.equal(r.statusCode,status,r.body);return r.json();};
  const customer=await post('/api/v1/customers',{code:'SOURCE',name:'独立来源'});
  await post(`/api/v1/customers/${customer.id}/opening-balance`,{amount:'-20.00',effectiveAt:'2026-01-01T00:00:00Z',reason:'独立可退款期初'});
  const receipt=await post('/api/v1/cash-events',{customerId:customer.id,kind:'receipt',amount:'20.00',occurredAt:'2026-01-02T00:00:00Z',method:'bank_transfer',allocationMode:'manual'});
  const refund=await post('/api/v1/cash-events',{customerId:customer.id,kind:'refund',amount:'25.00',occurredAt:'2026-01-03T00:00:00Z',method:'cash'});assert.equal(refund.balance.netBalance,'-15.00');assert.equal(refund.allocations.reduce((s:number,a:{amount:string})=>s+Number(a.amount),0),25);
  const protectedResult=await post(`/api/v1/cash-events/${receipt.id}/reverse`,{expectedVersion:receipt.version,reason:'退款仍占用应拒绝'},409);assert.equal(protectedResult.code,'RELATED_RECORD_CONFLICT');
  assert.equal((await f.pool.query('SELECT count(*) FROM cash_reversals')).rows[0].count,'0');assert.equal((await f.pool.query("SELECT count(*) FROM customer_ledger_entries WHERE category IN ('sale','return')")).rows[0].count,'0');assert.equal((await f.pool.query('SELECT count(*) FROM stock_movements')).rows[0].count,'0');
  const snapshot=await post(`/api/v1/customers/${customer.id}/statements`,{periodStart:'2026-01-01T00:00:00Z',periodEnd:'2026-02-01T00:00:00Z'});assert.equal(snapshot.closingBalance,'-15.00');assert.equal(snapshot.openingBalance,'-20.00');assert.equal(snapshot.receiptAmount,'20.00');assert.equal(snapshot.refundAmount,'25.00');
  const first=await f.app.inject({url:`/api/v1/statements/${snapshot.id}?limit=1`,headers:{cookie:actor.cookie}});assert.equal(first.statusCode,200,first.body);const firstPage=first.json();assert.ok(firstPage.nextCursor);
  await post('/api/v1/cash-events',{customerId:customer.id,kind:'receipt',amount:'1.00',occurredAt:'2026-01-01T12:00:00Z',method:'cash',allocationMode:'manual'});
  let next=firstPage.nextCursor;const rows=[...firstPage.rows];while(next){const r=await f.app.inject({url:`/api/v1/statements/${snapshot.id}?limit=1&cursor=${next}`,headers:{cookie:actor.cookie}});assert.equal(r.statusCode,200,r.body);const page=r.json();assert.equal(page.stale,true);assert.equal(page.closingBalance,'-15.00');rows.push(...page.rows);next=page.nextCursor;}
  assert.deepEqual(rows,snapshot.rows);assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
  const fresh=await post(`/api/v1/customers/${customer.id}/statements`,{periodStart:'2026-01-01T00:00:00Z',periodEnd:'2026-02-01T00:00:00Z'});assert.equal(fresh.closingBalance,'-16.00');assert.equal(fresh.rowCount,snapshot.rowCount+1);
  const bad=await f.app.inject({url:`/api/v1/statements/${fresh.id}?cursor=${firstPage.nextCursor}`,headers:{cookie:actor.cookie}});assert.equal(bad.statusCode,400,bad.body);
  await post(`/api/v1/cash-events/${refund.id}/reverse`,{expectedVersion:refund.version,reason:'先解除实际退款'},200);
  const valid=await post(`/api/v1/cash-events/${receipt.id}/reverse`,{expectedVersion:receipt.version,reason:'来源释放后可冲正'},200);assert.equal(valid.status,'reversed');
  const totals=(await f.pool.query('SELECT a.net_balance::text a,sum(l.amount_signed)::numeric(20,2)::text l FROM customer_accounts a JOIN customer_ledger_entries l ON l.customer_id=a.customer_id WHERE a.customer_id=$1 GROUP BY a.net_balance',[customer.id])).rows[0];assert.equal(totals.a,'-21.00');assert.equal(totals.a,totals.l);
 }finally{await f.cleanup();}
});
