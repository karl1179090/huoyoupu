import test from 'node:test';
import assert from 'node:assert/strict';
import type {HTTPMethods} from 'fastify';
import {openapiDocument} from '@huoyoupu/contracts';
import {apiFixture} from './helpers.js';

test('every planned OpenAPI method/path is actually registered under the API prefix',async t=>{
 const f=await apiFixture();
 try{
  await f.app.ready();
  const methods=new Set(['get','post','patch','put','delete','head','options']);
  const missing:string[]=[];let count=0;
  for(const [path,item]of Object.entries(openapiDocument.paths))for(const [method,definition]of Object.entries(item)){
   if(!methods.has(method)||!definition||typeof definition!=='object'||!('operationId'in definition))continue;
   const url=`/api/v1${path.replace(/\{([^}]+)\}/g,':$1')}`;
   count++;
   if(!f.app.hasRoute({method:method.toUpperCase() as HTTPMethods,url}))missing.push(`${method.toUpperCase()} ${url} (${definition.operationId})`);
  }
  assert.ok(count>0,'baseline must contain operations');
  t.diagnostic(`Checked ${count} planned OpenAPI operations against Fastify.hasRoute`);
  assert.deepEqual(missing,[],`Missing planned HTTP implementations out of ${count} operations`);
 }finally{await f.cleanup();}
});
