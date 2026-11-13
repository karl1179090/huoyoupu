import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {apiFixture,password,writeHeaders} from './helpers.js';
import {createSecurity} from '../src/modules/auth/service.js';
import {origin} from './helpers.js';
test('explicit employee operation policy preserves default admin, CSRF, idempotency and revocation-before-cache',async()=>{
 const f=await apiFixture();
 const security=createSecurity(f.pool,{origin});
 f.app.post('/test/employee-operation',async(request,reply)=>{const result=await security.withOperation(request,{kind:'test_employee_print',routeKey:'POST:/test/employee-operation',allowedRoles:['admin','employee']},async ctx=>{await ctx.client.query("INSERT INTO warehouses(id,code,name) VALUES($1,$2,'policy fixture')",[randomUUID(),randomUUID()]);return {status:201,body:{actorId:ctx.actor.id}};});return reply.code(result.status).send(result.body);});
 f.app.post('/test/admin-default',async(request,reply)=>{const result=await security.withOperation(request,{kind:'test_admin',routeKey:'POST:/test/admin-default'},async()=>({status:200,body:{ok:true}}));return reply.code(result.status).send(result.body);});
 try{
  const admin=await f.login();const created=await f.app.inject({method:'POST',url:'/api/v1/users',headers:writeHeaders(admin),payload:{loginName:'printer',password,role:'employee'}});assert.equal(created.statusCode,201,created.body);
  const employee=await f.login('printer');
  const denied=await f.app.inject({method:'POST',url:'/test/admin-default',headers:writeHeaders(employee)});assert.equal(denied.statusCode,403);
  const invalid=await f.app.inject({method:'POST',url:'/test/employee-operation',headers:{...writeHeaders(employee),'x-csrf-token':'invalid'}});assert.equal(invalid.statusCode,403);
  const headers=writeHeaders(employee);const first=await f.app.inject({method:'POST',url:'/test/employee-operation',headers});assert.equal(first.statusCode,201,first.body);
  const repeat=await f.app.inject({method:'POST',url:'/test/employee-operation',headers});assert.deepEqual(repeat.json(),first.json());assert.equal((await f.pool.query('SELECT count(*) FROM warehouses')).rows[0].count,'1');
  const disabled=await f.app.inject({method:'PATCH',url:`/api/v1/users/${created.json().id}`,headers:writeHeaders(admin),payload:{expectedVersion:created.json().version,active:false}});assert.equal(disabled.statusCode,200,disabled.body);
  const revoked=await f.app.inject({method:'POST',url:'/test/employee-operation',headers});assert.equal(revoked.statusCode,401);assert.equal((await f.pool.query('SELECT count(*) FROM warehouses')).rows[0].count,'1');
 }finally{await f.cleanup();}
});
