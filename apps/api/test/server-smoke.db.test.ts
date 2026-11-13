import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {apiFixture,origin,password} from './helpers.js';

test('compiled runtime migrates and serves real HTTP login, protected API and graceful shutdown',{timeout:15000},async()=>{
 const f=await apiFixture();let child:ReturnType<typeof spawn>|undefined;
 try{
  const migrate=spawn(process.execPath,['infra/runtime.mjs','migrate'],{env:{...process.env,DATABASE_URL:f.url},stdio:'ignore'});assert.deepEqual(await once(migrate,'exit'),[0,null]);
  const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const address=listener.address();assert.ok(address&&typeof address==='object');const port=address.port;await new Promise<void>((resolve,reject)=>listener.close(error=>error?reject(error):resolve()));
  child=spawn(process.execPath,['infra/runtime.mjs','serve'],{env:{...process.env,DATABASE_URL:f.url,PUBLIC_ORIGIN:origin,HOST:'127.0.0.1',PORT:String(port),AI_API_KEY:'',AI_API_KEY_FILE:'',AI_MODEL:''},stdio:'ignore'});
  const base=`http://127.0.0.1:${port}`;
  let ready=false;
  for(let attempt=0;attempt<100;attempt++){
   try{ready=(await fetch(`${base}/health`)).ok;if(ready)break;}catch{}
   if(child.exitCode!==null)throw new Error('Compiled runtime exited before readiness');
   await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.equal(ready,true,'runtime readiness timeout');
  assert.equal((await fetch(`${base}/api/v1/users`)).status,401);
  const session=await fetch(`${base}/api/v1/auth/session`);const sessionCookie=session.headers.getSetCookie()[0]!.split(';')[0]!;const csrf=(await session.json()).csrfToken;
  const login=await fetch(`${base}/api/v1/auth/login`,{method:'POST',headers:{origin,cookie:sessionCookie,'x-csrf-token':csrf,'content-type':'application/json'},body:JSON.stringify({loginName:'admin',password})});assert.equal(login.status,200);const logged=await login.json();const cookie=login.headers.getSetCookie()[0]!.split(';')[0]!;
  const users=await fetch(`${base}/api/v1/users`,{headers:{cookie}});assert.equal(users.status,200);assert.equal((await users.json()).items.length,1);
  const unavailable=await fetch(`${base}/api/v1/ai/queries`,{method:'POST',headers:{origin,cookie,'x-csrf-token':logged.csrfToken,'content-type':'application/json'},body:JSON.stringify({question:'查询当前库存'})});assert.equal(unavailable.status,503);assert.equal((await unavailable.json()).code,'AI_PROVIDER_UNAVAILABLE');
  const closed=once(child,'exit');child.kill('SIGTERM');assert.deepEqual(await closed,[0,null]);child=undefined;
  await assert.rejects(fetch(`${base}/health`));
 }finally{if(child&&child.exitCode===null&&child.signalCode===null){const ended=once(child,'exit');child.kill('SIGTERM');await ended;}await f.cleanup();}
});
