import type {FastifyInstance,FastifyRequest} from 'fastify';
import {openapiDocument,parseOperationRequest,parseOperationResponse,type OperationId,type OperationRequest} from '@huoyoupu/contracts';
import type {ApiDependencies,OperationContext} from '../../lib/security.js';
import {readBalance,type Sql} from './core.js';
import {applyBalance,getCash,recordCash,recordOpening,reverseCash} from './cash.js';
import {listCash,listLedger} from './queries.js';
import {createStatement,getStatement,listStatements} from './statements.js';
export function registerFinance(app:FastifyInstance,deps:ApiDependencies):void {
  function route(id:OperationId) {
    for(const [path,item] of Object.entries(openapiDocument.paths))for(const [method,raw]of Object.entries(item)){
      const definition=raw as {operationId?:string;parameters?:({$ref:string}|{name:string;in:string})[]};
      if(definition.operationId===id)return {url:`/api/v1${path.replace(/\{([^}]+)\}/g,':$1')}`,method:method.toUpperCase(),definition};
    }throw new Error(`Missing finance contract ${id}`);
  }
  function input<O extends OperationId>(id:O,request:FastifyRequest):OperationRequest<O> {
    const query={...(request.query as Record<string,unknown>??{})};
    if(typeof query.limit==='string'&&/^(0|[1-9][0-9]*)$/.test(query.limit))query.limit=Number(query.limit);
    const headers:Record<string,unknown>={};
    for(const raw of route(id).definition.parameters??[]){
      const parameter='$ref'in raw?(openapiDocument.components.parameters as Record<string,{name:string;in:string}>)[raw.$ref.split('/').at(-1)!]!:raw;
      if(parameter.in==='header'&&request.headers[parameter.name.toLowerCase()]!==undefined)headers[parameter.name]=request.headers[parameter.name.toLowerCase()];
    }
    return parseOperationRequest(id,{path:request.params??{},query,headers,...(request.body===undefined?{}:{body:request.body})});
  }
  function read<O extends OperationId>(id:O,work:(sql:Sql,input:OperationRequest<O>)=>Promise<unknown>){
    app.get(route(id).url,async request=>{const actor=await deps.security.requireAdmin(request);return parseOperationResponse(id,200,actor.role,await work(deps.pool,input(id,request)));});
  }
  function write<O extends OperationId>(id:O,status:number,work:(context:OperationContext,input:OperationRequest<O>)=>Promise<unknown>){
    const definition=route(id);
    app.post(definition.url,async(request,reply)=>{
      await deps.security.requireAdmin(request);
      const result=await deps.security.withOperation(request,{kind:id,routeKey:`POST:${definition.url}`},async context=>({status,body:parseOperationResponse(id,status,context.actor.role,await work(context,input(id,request)))}));
      if(result.replayed)reply.header('Idempotency-Replayed','true');return reply.code(result.status).send(result.body);
    });
  }
  read('getCustomerBalance',(sql,r)=>readBalance(sql,r.path!.customerId));
  read('getCustomerLedger',(sql,r)=>listLedger(sql,r.path!.customerId,r.query??{}));
  read('listCashEvents',(sql,r)=>listCash(sql,r.query??{}));
  read('getCashEvent',(sql,r)=>getCash(sql,r.path!.cashEventId));
  read('getStatement',(sql,r)=>getStatement(sql,r.path!.statementId,r.query));
  read('listStatements',(sql,r)=>listStatements(sql,r.path!.customerId,r.query??{}));
  write('recordOpeningBalance',201,(ctx,r)=>recordOpening(ctx,r.path!.customerId,r.body!));
  write('applyCustomerBalance',201,(ctx,r)=>applyBalance(ctx,r.path!.customerId,r.body!));
  write('recordCashEvent',201,(ctx,r)=>recordCash(ctx,r.body!));
  write('reverseCashEvent',200,(ctx,r)=>reverseCash(ctx,r.path!.cashEventId,r.body!));
  write('createStatement',201,(ctx,r)=>createStatement(ctx,r.path!.customerId,r.body!));
}
