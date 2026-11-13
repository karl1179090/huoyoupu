import type {FastifyInstance} from 'fastify';
import {parseOperationRequest,parseOperationResponse} from '@huoyoupu/contracts';
import type {ApiDependencies} from '../../lib/security.js';
import {AppError} from '../../lib/errors.js';
import {askAi,type AiOptions} from './service.js';
export {createResponsesAdapter,type ModelAdapter} from './model.js';
export {askAi,type AiOptions} from './service.js';
export function registerAi(app:FastifyInstance,deps:ApiDependencies,options:AiOptions={}):void{
 const running=new Set<string>();
 app.post('/api/v1/ai/queries',async request=>{
  const actor=await deps.security.requireAdmin(request);await deps.security.validateReadPost(request);
  const input=parseOperationRequest('askReport',{body:request.body,headers:{'X-CSRF-Token':request.headers['x-csrf-token']}});
  if(running.has(actor.id))throw new AppError('RATE_LIMITED',429,'同一管理员已有AI查询进行中',{retryAfterMs:1000},true);
  running.add(actor.id);try{return parseOperationResponse('askReport',200,actor.role,await askAi(deps.pool,actor.id,input.body,options));}finally{running.delete(actor.id);}
 });
}
