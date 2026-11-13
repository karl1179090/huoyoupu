import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSchema} from '../../../packages/contracts/src/index.js';
import {createApp} from '../../../apps/api/src/app.js';

test('independent request pipeline maps bad media, JSON, declared length and unknown AI fields to safe permanent errors',async()=>{
 const app=createApp({bodyLimit:64});app.post('/acceptance/ai-input',async request=>parseSchema('AiInput',request.body));
 try{
  const cases=[
   {headers:{'content-type':'application/octet-stream'},payload:'private-request-sentinel'},
   {headers:{'content-type':'application/json'},payload:'{"private-request-sentinel":'},
   {headers:{'content-type':'application/json','content-length':'2'},payload:'{"question":"private-request-sentinel"}'},
   {headers:{'content-type':'application/json'},payload:JSON.stringify({question:'private-request-sentinel',sql:'SELECT * FROM users'})},
   {headers:{'content-type':'application/json'},payload:JSON.stringify({question:'private-request-sentinel'.repeat(10)})},
  ];
  for(const input of cases){const r=await app.inject({method:'POST',url:'/acceptance/ai-input',...input});assert.equal(r.statusCode,400,r.body);const error=parseSchema('ApiError',r.json());assert.equal(error.code,'INVALID_REQUEST');assert.equal(error.retryable,false);assert.ok(!r.body.includes('private-request-sentinel'));}
 }finally{await app.close();}
});
