import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Pool} from 'pg';
import {createTestDatabase} from '../src/testing.js';
import {migrate} from '../src/migrate.js';
import {apiFixture,writeHeaders} from '../../../apps/api/test/helpers.js';
async function command(mode:string,file:string,url:string) {
 return new Promise<number>((resolve,reject)=>{const child=spawn(process.execPath,['scripts/database-backup.mjs',mode,file],{env:{...process.env,DATABASE_URL:url},stdio:['ignore','pipe','pipe']});let error='';child.stderr.on('data',data=>{error+=String(data);});child.on('error',reject);child.on('exit',code=>{if(code!==0)reject(new Error(error));else resolve(code);});});
}
async function manifest(pool:Pool){
 const names=(await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
 const result:Record<string,string>={};
 for(const {tablename}of names){const table=String(tablename).replaceAll('"','""');result[tablename]=(await pool.query(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]')::text) AS hash FROM "${table}" t`)).rows[0].hash;}
 return result;
}
test('custom archive restores every business table into a new empty PostgreSQL database without overwriting existing data',async()=>{
 const source=await apiFixture(),target=await createTestDatabase({migrate:false}),directory=await mkdtemp(join(tmpdir(),'huoyoupu-restore-'));
 try{
  const credentials=await source.login();
  const post=async(url:string,payload:Record<string,unknown>,status=201)=>{const r=await source.app.inject({method:'POST',url,headers:writeHeaders(credentials),payload});assert.equal(r.statusCode,status,r.body);return r.json();};
  const customer=await post('/api/v1/customers',{code:'BACKUP-C',name:'恢复核对虚构客户'});await post(`/api/v1/customers/${customer.id}/addresses`,{contactName:'测试',address:'测试地址',isDefault:true});
  const product=await post('/api/v1/products',{code:'BACKUP-P',name:'恢复商品',baseUnit:{name:'瓶',defaultSalePrice:'5'}}),warehouse=await post('/api/v1/warehouses',{code:'BACKUP-W',name:'恢复仓'});
  await post('/api/v1/receipts',{kind:'opening',warehouseId:warehouse.id,receivedAt:'2026-01-01T00:00:00Z',lines:[{productId:product.id,unitId:product.baseUnitId,quantity:10,unitCost:'2'}]});
  const draft=await post('/api/v1/orders',{customerId:customer.id,lines:[{clientLineId:'restore',productId:product.id,warehouseId:warehouse.id,unitId:product.baseUnitId,quantity:2,unitPrice:'5',allocationMode:'auto'}],discountAmount:'0.00',roundOffAmount:'0.00'});
  await post(`/api/v1/orders/${draft.id}/confirm`,{expectedVersion:draft.version},200);
  await post('/api/v1/cash-events',{kind:'receipt',customerId:customer.id,amount:'12.00',occurredAt:new Date().toISOString(),method:'cash',allocationMode:'auto'});
  await post(`/api/v1/customers/${customer.id}/statements`,{periodStart:'2026-01-01T00:00:00Z',periodEnd:'2027-01-01T00:00:00Z'});
  const file=join(directory,'fictional.dump');
  await command('backup',file,source.url);assert.equal((await stat(file)).mode&0o777,0o600);
  await assert.rejects(command('backup',file,source.url),/already exists/);
  const competing=await Promise.allSettled([1,2].map(()=>command('backup',join(directory,'concurrent.dump'),source.url)));assert.equal(competing.filter(result=>result.status==='fulfilled').length,1);
  await command('restore',file,target.url);
  assert.deepEqual(await manifest(target.pool),await manifest(source.pool));assert.deepEqual(await migrate(target.pool),[]);
  const inventory=(await target.pool.query('SELECT quantity_base,cost_amount::text FROM stock_balances')).rows[0];assert.equal(inventory.quantity_base,'8');assert.equal(inventory.cost_amount,'16.00');
  const account=(await target.pool.query('SELECT net_balance::text FROM customer_accounts')).rows[0];assert.equal(account.net_balance,'-2.00');
  await assert.rejects(command('restore',file,target.url),/empty database/);assert.deepEqual(await manifest(target.pool),await manifest(source.pool));
 }finally{await target.cleanup();await source.cleanup();await rm(directory,{recursive:true,force:true});}
});
