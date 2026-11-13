import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createTestDatabase} from '../../../packages/database/src/testing.js';
import {apiFixture,origin,password,writeHeaders} from '../../../apps/api/test/helpers.js';
import {createSecurity} from '../../../apps/api/src/modules/auth/service.js';

test('independent acceptance: session challenge rotation rejects the old CSRF and duplicate session cookies',async()=>{
 const fixture=await apiFixture();
 try{
  const actor=await fixture.login();
  const refreshed=await fixture.app.inject({url:'/api/v1/auth/session',headers:{cookie:actor.cookie}});
  assert.equal(refreshed.statusCode,200);assert.notEqual(refreshed.json().csrfToken,actor.csrf);
  const rejected=await fixture.app.inject({method:'POST',url:'/api/v1/warehouses',headers:writeHeaders(actor),payload:{code:'OLD-CSRF',name:'拒绝旧令牌'}});
  assert.equal(rejected.statusCode,403);assert.equal(rejected.json().code,'CSRF_INVALID');
  const accepted=await fixture.app.inject({method:'POST',url:'/api/v1/warehouses',headers:{...writeHeaders(actor),'x-csrf-token':refreshed.json().csrfToken},payload:{code:'NEW-CSRF',name:'新令牌'}});
  assert.equal(accepted.statusCode,201,accepted.body);
  const duplicate=await fixture.app.inject({url:'/api/v1/users',headers:{cookie:`${actor.cookie}; ${actor.cookie}`}});
  assert.equal(duplicate.statusCode,401);
  assert.equal((await fixture.pool.query("SELECT count(*) FROM warehouses WHERE code='OLD-CSRF'")).rows[0].count,'0');
 }finally{await fixture.cleanup();}
});

test('independent acceptance: administrator CLI refuses a publicly readable password file without leaking it',async()=>{
 const database=await createTestDatabase();const directory=await mkdtemp(join(tmpdir(),'hyp-init-negative-'));const file=join(directory,'password');
 try{
  await writeFile(file,password,{mode:0o644});
  const result=spawnSync('npm',['run','admin:init'],{encoding:'utf8',env:{...process.env,DATABASE_URL:database.url,HYP_ADMIN_LOGIN:'must-not-create',HYP_ADMIN_PASSWORD_FILE:file}});
  assert.equal(result.status,1);assert.match(result.stderr,/0600/);assert.ok(!`${result.stdout}${result.stderr}`.includes(password));
  assert.equal((await database.pool.query('SELECT count(*) FROM users')).rows[0].count,'0');
 }finally{await database.cleanup();await rm(directory,{recursive:true,force:true});}
});

test('independent acceptance: exhausted serialization retries stop at three, rollback all effects and replay failure',async()=>{
 const fixture=await apiFixture();let attempts=0;const security=createSecurity(fixture.pool,{origin});
 await fixture.pool.query('CREATE TABLE acceptance_effects(operation_id uuid PRIMARY KEY,value integer NOT NULL)');
 fixture.app.post('/acceptance/retry',async(request,reply)=>{
  const result=await security.withOperation(request,{kind:'acceptanceRetry',routeKey:'POST:/acceptance/retry'},async context=>{
   attempts++;await context.client.query('INSERT INTO acceptance_effects VALUES($1,1)',[context.operationId]);
   throw Object.assign(new Error('do not expose raw serialization details'),{code:'40001'});
  });return reply.code(result.status).send(result.body);
 });
 try{
  const actor=await fixture.login();const key=randomUUID();const options={method:'POST' as const,url:'/acceptance/retry',headers:writeHeaders(actor,key),payload:{mode:'always-conflict'}};
  const failed=await fixture.app.inject(options);assert.equal(failed.statusCode,503,failed.body);assert.equal(failed.json().code,'RETRYABLE_CONFLICT');assert.equal(attempts,3);
  const repeated=await fixture.app.inject(options);assert.deepEqual(repeated.json(),failed.json());assert.equal(attempts,3);
  assert.ok(!failed.body.includes('raw serialization'));assert.equal((await fixture.pool.query('SELECT count(*) FROM acceptance_effects')).rows[0].count,'0');
  assert.equal((await fixture.pool.query("SELECT count(*) FROM business_operations WHERE kind='acceptanceRetry'")).rows[0].count,'0');
 }finally{await fixture.cleanup();}
});
