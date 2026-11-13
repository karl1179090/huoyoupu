/** Explicit, opt-in capacity fixture. Run only with scripts/test-postgres.ts. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mock} from 'node:test';
import {performance} from 'node:perf_hooks';
import {cpus,totalmem,platform,arch} from 'node:os';
import {mkdir,writeFile} from 'node:fs/promises';
import type {PoolClient} from 'pg';
import {createTestDatabase} from '@huoyoupu/database/testing';
import {withTransaction} from '@huoyoupu/database';
import type {SchemaValue} from '@huoyoupu/contracts';
import type {Actor,OperationContext} from '../apps/api/src/lib/security.js';
import * as catalog from '../apps/api/src/modules/catalog/service.js';
import {createReceipt,listInventory} from '../apps/api/src/modules/inventory/service.js';
import {createDraft} from '../apps/api/src/modules/sales/drafts.js';
import {confirmOrder} from '../apps/api/src/modules/sales/confirm.js';
import {listOrders,historicalPrice} from '../apps/api/src/modules/sales/reads.js';
import {financePort,readBalance} from '../apps/api/src/modules/finance/core.js';
import {recordCash} from '../apps/api/src/modules/finance/cash.js';
import {orderOutstanding} from '../apps/api/src/modules/finance/settlements.js';
import {listLedger} from '../apps/api/src/modules/finance/queries.js';
import {createStatement} from '../apps/api/src/modules/finance/statements.js';
import {queryReport} from '../apps/api/src/modules/reporting/service.js';

if(!process.env.TEST_DATABASE_URL)throw new Error('Use npm run test:db -- scripts/validate-target-scale.ts; never point at a business database');
const db=await createTestDatabase();
const directory='docs/verification/build-web-inventory-v1';
const actor:Actor={id:randomUUID(),loginName:'scale-fixture',role:'admin',active:true,version:1};
const started=performance.now(),realNow=Date.now();
const base=Date.parse('2025-11-11T01:00:00Z');
const days=Number(process.env.SCALE_DAYS??365);
assert.ok(Number.isSafeInteger(days)&&days>=2&&days<=365);
let target=days*50;
let capture: {text:string;values:unknown[]}[]|null=null;
const instrumented=new WeakSet<PoolClient>();
function instrument(client:PoolClient){
 if(instrumented.has(client))return;instrumented.add(client);
 const query=client.query;
 client.query=function(this:PoolClient,...args:unknown[]){
  const text=args[0];
  if(capture&&typeof text==='string'&&/^\s*(SELECT|WITH)\b/i.test(text)&&/\bFROM\b/i.test(text))capture.push({text,values:Array.isArray(args[1])?[...args[1]]:[]});
  return Reflect.apply(query,this,args);
 } as typeof client.query;
}
db.pool.on('connect',instrument);
const initial=await db.pool.connect();instrument(initial);initial.release();
const operation=<T>(work:(context:OperationContext)=>Promise<T>)=>withTransaction(db.pool,async client=>{
 const operationId=randomUUID();await client.query('INSERT INTO business_operations(id,kind,actor_id) VALUES($1,$2,$3)',[operationId,'target_scale_fixture',actor.id]);
 return work({client,actor,operationId});
});
const products:SchemaValue<'Product'>[]=[],customers:SchemaValue<'Customer'>[]=[],warehouses:SchemaValue<'Warehouse'>[]=[];
const measurements:Record<string,unknown>={},plans:Record<string,unknown>={};
let seedSeconds=0,clockEnabled=false;
async function measure(name:string,work:()=>Promise<unknown>){
 const elapsed:number[]=[];capture=[];
 let samples:{text:string;values:unknown[]}[]=[];
 for(let i=0;i<3;i++){const at=performance.now();await work();elapsed.push(performance.now()-at);if(i===0){samples=capture??[];capture=null;}}
 const unique=[...new Map(samples.map(query=>[query.text,query])).values()];
 const explained=[];
 for(const query of unique){const result=await db.pool.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+query.text,query.values);explained.push({sql:query.text,parameters:query.values,explain:result.rows[0]['QUERY PLAN'][0]});}
 measurements[name]={milliseconds:elapsed,uniqueSelectPlans:unique.length};plans[name]=explained;
 console.log('MEASURE',name,JSON.stringify(measurements[name]));
}
try{
 await db.pool.query('INSERT INTO users(id,login_name,normalized_login_name,password_hash,role) VALUES($1,$2,$2,$3,$4)',[actor.id,actor.loginName,'non-login-fixture',actor.role]);
 for(let i=0;i<200;i++)products.push(await withTransaction(db.pool,client=>catalog.createProduct(client,{code:`SCALE-P${i}`,name:`500ml酱油虚构商品${i}`,baseUnit:{name:'瓶',defaultSalePrice:'5'}})));
 for(let i=0;i<100;i++)customers.push(await withTransaction(db.pool,async client=>{const customer=await catalog.createCustomer(client,{code:`SCALE-C${i}`,name:`规模虚构客户${i}`});await catalog.createAddress(client,customer.id,{contactName:'虚构联系人',address:'虚构测试地址',isDefault:true});return customer;}));
 for(let i=0;i<2;i++)warehouses.push(await withTransaction(db.pool,client=>catalog.createWarehouse(client,{code:`SCALE-W${i}`,name:`规模虚构仓${i}`})));
 for(const warehouse of warehouses)for(let batch=0;batch<4;batch++)await operation(context=>createReceipt(context,{kind:'opening',warehouseId:warehouse.id,receivedAt:new Date(base-86400000+batch*1000).toISOString(),lines:products.map(product=>({productId:product.id,unitId:product.baseUnitId,quantity:1000,unitCost:'2'}))}));
 const seedStart=performance.now();
 mock.timers.enable({apis:['Date'],now:base});clockEnabled=true;
 for(let i=0;i<target;i++){
  mock.timers.setTime(base+Math.floor(i/50)*86400000+(i%50)*60000);
  const customer=customers[i%100]!;
  await operation(async context=>{
   const draft=await createDraft(context,{customerId:customer.id,discountAmount:'0.00',roundOffAmount:'0.00',lines:[0,1,2].map(j=>{const product=products[(i*7+j*67)%200]!;return {clientLineId:`scale-${i}-${j}`,productId:product.id,unitId:product.baseUnitId,warehouseId:warehouses[i%2]!.id,quantity:1+i%3,unitPrice:'5',allocationMode:'auto' as const};})});
   const order=await confirmOrder(context,draft.id,draft.version,financePort);
   if(i%5===0)await recordCash(context,{kind:'receipt',customerId:customer.id,amount:order.totalAmount,occurredAt:new Date().toISOString(),method:'cash',allocationMode:'manual',allocations:[{orderId:order.id,amount:order.totalAmount}]});
  });
  if(i===99){const pilot=(performance.now()-seedStart)/1000;console.log('PILOT_100_SECONDS',pilot);if(pilot>8&&target>4500){target=4500;console.log('BOUNDED_TO_90_DAYS_TO_LIMIT_FIXTURE_COST');}}
  if((i+1)%1000===0)console.log('SEEDED_ORDERS',i+1);
 }
 mock.timers.reset();clockEnabled=false;seedSeconds=(performance.now()-seedStart)/1000;
 await db.pool.query('ANALYZE');
 const from=new Date(base+(target/50-30)*86400000).toISOString(),to=new Date(base+(target/50)*86400000).toISOString();
 const customer=customers[1]!,product=products[7]!;
 await measure('product_search_500mljy',()=>catalog.listCatalog(db.pool,'Product',{q:'500mljy',limit:50}));
 await measure('customer_order_page',()=>listOrders(db.pool,'admin',{customerId:customer.id,status:'confirmed',limit:50}));
 await measure('unsettled_candidates_50',async()=>{const page=await listOrders(db.pool,'admin',{customerId:customer.id,status:'confirmed',limit:50});for(const order of page.items)await withTransaction(db.pool,client=>orderOutstanding(client,customer.id,order.id));});
 await measure('inventory_batches',()=>listInventory(db.pool,'Batch',{productId:product.id,warehouseId:warehouses[1]!.id,limit:50}));
 await measure('customer_ledger_page',()=>listLedger(db.pool,customer.id,{limit:50}));
 await measure('historical_price',()=>historicalPrice(db.pool,customer.id,product.id,product.baseUnitId));
 await measure('monthly_statement',()=>operation(context=>createStatement(context,customer.id,{periodStart:from,periodEnd:to})));
 await measure('report_sales_30_days',()=>queryReport(db.pool,actor.id,{kind:'sales_summary',period:{mode:'custom',start:from,end:to}}));
 await measure('report_customer_balances',()=>queryReport(db.pool,actor.id,{kind:'customer_balances'}));
 await measure('report_inventory',()=>queryReport(db.pool,actor.id,{kind:'inventory'}));
 const readStart=performance.now();await Promise.all([0,1,2,3,4].map(async i=>{await listLedger(db.pool,customers[i]!.id,{limit:50});await readBalance(db.pool,customers[i]!.id);}));
 measurements['five_concurrent_reads']={milliseconds:performance.now()-readStart,workers:5};
 const before=(await db.pool.query('SELECT sum(quantity_base)::text AS quantity FROM stock_balances')).rows[0].quantity;
 const writeStart=performance.now();await Promise.all([0,1,2,3,4].map(i=>operation(async context=>{const draft=await createDraft(context,{customerId:customers[99]!.id,discountAmount:'0.00',roundOffAmount:'0.00',lines:[0,1,2].map(j=>({clientLineId:`concurrent-${i}-${j}`,productId:products[j]!.id,unitId:products[j]!.baseUnitId,warehouseId:warehouses[0]!.id,quantity:1,unitPrice:'5',allocationMode:'auto' as const}))});return confirmOrder(context,draft.id,draft.version,financePort);}))); 
 const after=(await db.pool.query('SELECT sum(quantity_base)::text AS quantity FROM stock_balances')).rows[0].quantity;assert.equal(BigInt(before)-BigInt(after),15n);
 measurements['five_concurrent_confirmations']={milliseconds:performance.now()-writeStart,workers:5,quantityDecrease:15};
 const invariant=(await db.pool.query(`SELECT
 (SELECT sum(quantity_base) FROM stock_balances)=(SELECT sum(remaining_quantity_base) FROM inventory_batches) AND (SELECT sum(quantity_base) FROM stock_balances)=(SELECT sum(quantity_delta_base) FROM stock_movements) AS quantity_ok,
 (SELECT sum(cost_amount) FROM stock_balances)=(SELECT sum(remaining_cost_amount) FROM inventory_batches) AND (SELECT sum(cost_amount) FROM stock_balances)=(SELECT sum(cost_delta_amount) FROM stock_movements) AS cost_ok,
 (SELECT sum(net_balance) FROM customer_accounts)=(SELECT sum(amount_signed) FROM customer_ledger_entries) AS accounts_ok`)).rows[0];assert.deepEqual(invariant,{quantity_ok:true,cost_ok:true,accounts_ok:true});
 const counts=(await db.pool.query(`SELECT (SELECT count(*) FROM products)::int AS products,(SELECT count(*) FROM customers)::int AS customers,(SELECT count(*) FROM sales_orders)::int AS orders,(SELECT count(*) FROM revision_lines)::int AS revision_lines,(SELECT count(*) FROM inventory_batches)::int AS batches,(SELECT count(*) FROM stock_movements)::int AS movements,(SELECT count(*) FROM customer_ledger_entries)::int AS ledger,(SELECT count(*) FROM settlement_allocations)::int AS allocations,pg_database_size(current_database()) AS bytes`)).rows[0];
 const settings=(await db.pool.query("SELECT name,setting,unit FROM pg_settings WHERE name IN ('shared_buffers','work_mem','max_connections') ORDER BY name")).rows;
 await mkdir(directory,{recursive:true});
 await writeFile(`${directory}/target-scale-results.json`,JSON.stringify({at:new Date(realNow).toISOString(),hardware:{platform:platform(),arch:arch(),cpu:cpus()[0]?.model,logicalCpus:cpus().length,memoryBytes:totalmem()},postgres:(await db.pool.query('SELECT version()')).rows[0].version,settings,assumptions:{requestedDays:days,actualDays:target/50,ordersPerDay:50,linesPerOrder:3,warehouses:2,batchesPerProductWarehouse:4,paidEveryFifthOrder:true,simulationBase:new Date(base).toISOString(),period:{from,to}},seedSeconds,counts,invariant,measurements,totalSeconds:(performance.now()-started)/1000},null,2)+'\n');
 await writeFile(`${directory}/target-scale-plans.json`,JSON.stringify(plans,null,2)+'\n');
 console.log('TARGET_SCALE_COMPLETE',JSON.stringify({counts,seedSeconds,invariant}));
}finally{
 capture=null;if(clockEnabled)mock.timers.reset();await db.cleanup();console.log('ISOLATED_DATABASE_CLEANED');
}
