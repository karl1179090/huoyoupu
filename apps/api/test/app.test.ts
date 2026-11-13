import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSchema} from '@huoyoupu/contracts';
import {createApp} from '../src/app.js';
test('health probe and unknown routes', async () => {
  const app = createApp();
  try {
    const response = await app.inject({method: 'GET', url: '/health'});
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {status: 'ok'});
    assert.equal((await app.inject({method: 'GET', url: '/missing'})).statusCode, 404);
  } finally { await app.close(); }
});

test('HTTP media, malformed JSON and payload size errors are permanent contract errors',async()=>{
 const app=createApp({bodyLimit:64});
 app.post('/test-json',async request=>{parseSchema('StatementInput',request.body);return {ok:true};});
 try{
  for(const [contentType,payload]of [['application/octet-stream','private-sentinel'],['application/json','{'],['application/json',JSON.stringify({privateValue:'x'.repeat(100)})],['text/plain','private-sentinel']] as const){
   const response=await app.inject({method:'POST',url:'/test-json',headers:{'content-type':contentType},payload});assert.equal(response.statusCode,400,response.body);
   const error=parseSchema('ApiError',response.json());assert.equal(error.code,'INVALID_REQUEST');assert.equal(error.retryable,false);assert.ok(!response.body.includes('private-sentinel'));
  }
 }finally{await app.close();}
});
