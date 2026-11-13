import type {FastifyInstance,FastifyRequest} from 'fastify';
import {withTransaction} from '@huoyoupu/database';
import {openapiDocument,parseOperationRequest,parseOperationResponse,projectOrderResponse,type OperationId,type OperationRequest} from '@huoyoupu/contracts';
import {appendAudit} from '../../lib/audit.js';
import type {ApiDependencies,OperationContext} from '../../lib/security.js';
import type {FinancePort} from '../finance/port.js';
import {createDraft,patchDraft,updateDelivery} from './drafts.js';
import {confirmOrder} from './confirm.js';
import {fail,getOrder} from './model.js';
import {quoteNewOrder,quoteRevision} from './quote.js';
import {voidOrder} from './void.js';
import {confirmReturn,getReturn,listOrderReturns,recordRestock} from './returns.js';
import {reviseOrder} from './revisions.js';
import {listOrders,listRevisions} from './reads.js';
export {historicalPrice} from './reads.js';

type Route={operationId:OperationId;method:string;url:string;parameters:unknown[]};
const routes:Route[]=[];
for(const [path,item]of Object.entries(openapiDocument.paths))for(const [method,value]of Object.entries(item)){
 const operation=value as unknown as {operationId?:OperationId;parameters?:unknown[]};if(operation.operationId)routes.push({operationId:operation.operationId,method:method.toUpperCase(),url:`/api/v1${path.replace(/\{([^}]+)\}/g,':$1')}`,parameters:operation.parameters??[]});
}
function input<O extends OperationId>(route:Route,request:FastifyRequest):OperationRequest<O>{
 const query={...request.query as Record<string,unknown>};if(typeof query.limit==='string'&&/^[1-9][0-9]*$/.test(query.limit))query.limit=Number(query.limit);
 const headers:Record<string,unknown>={};
 for(const entry of route.parameters){const parameter=entry as {$ref?:string;name?:string;in?:string};const p=parameter.$ref?(openapiDocument.components.parameters as Record<string,{name:string;in:string}>)[parameter.$ref.split('/').at(-1)!]!:parameter;if(p.in==='header'&&p.name&&request.headers[p.name.toLowerCase()]!==undefined)headers[p.name]=request.headers[p.name.toLowerCase()];}
 return parseOperationRequest(route.operationId as O,{path:request.params??{},query,headers,...(request.body===undefined?{}:{body:request.body})});
}
export function registerSales(app:FastifyInstance,dependencies:ApiDependencies,options:{finance?:FinancePort}={}):void{
 const finance=()=>options.finance??fail('RETRYABLE_CONFLICT','客户往来事务服务尚未接入，不能确认业务',503);
 function write<O extends OperationId>(id:O,status:number,handler:(context:OperationContext,request:OperationRequest<O>)=>Promise<unknown>):void{
  const route=routes.find(route=>route.operationId===id)!;
  app.route({method:route.method as 'POST'|'PATCH',url:route.url,handler:async(request,reply)=>{
   await dependencies.security.requireAdmin(request);
   const result=await dependencies.security.withOperation(request,{kind:id,routeKey:`${route.method}:${route.url}`},async context=>{
    const parsed=input<O>(route,request);const body=await handler(context,parsed);
    const entityId=body&&typeof body==='object'&&'id'in body&&typeof body.id==='string'?body.id:undefined;
    await appendAudit(context,{entityType:id,...(entityId?{entityId}:{}),after:body});
    return{status,body:parseOperationResponse(id,status,context.actor.role,body)};
   });if(result.replayed)reply.header('Idempotency-Replayed','true');return reply.code(result.status).send(result.body);
  }});
 }
 function read<O extends OperationId>(id:O,handler:(request:OperationRequest<O>,role:'admin'|'employee')=>Promise<unknown>):void{
  const route=routes.find(route=>route.operationId===id)!;app.get(route.url,async request=>{const actor=['listOrderReturns','getReturn'].includes(id)?await dependencies.security.requireAdmin(request):await dependencies.security.requireUser(request);const body=await handler(input<O>(route,request),actor.role);return parseOperationResponse(id,200,actor.role,body);});
 }
 read('listOrders',(request,role)=>listOrders(dependencies.pool,role,request.query));
 read('getOrder',async(request,role)=>projectOrderResponse(role,'detail',await getOrder(dependencies.pool,request.path!.orderId)));
 read('getOrderRevision',async(request,role)=>projectOrderResponse(role,'revision',await getOrder(dependencies.pool,request.path!.orderId,request.path!.revisionId)));
 read('listOrderRevisions',(request)=>listRevisions(dependencies.pool,request.path!.orderId,request.query));
 write('createOrderDraft',201,(context,request)=>createDraft(context,request.body!));
 write('updateOrderDraft',200,(context,request)=>patchDraft(context,request.path!.orderId,request.body!));
 write('setDeliveryStatus',200,(context,request)=>updateDelivery(context,request.path!.orderId,request.body!));
 write('confirmOrder',200,(context,request)=>confirmOrder(context,request.path!.orderId,request.body!.expectedVersion,finance()));
 read('getReturn',request=>getReturn(dependencies.pool,request.path!.returnId));
 read('listOrderReturns',request=>listOrderReturns(dependencies.pool,request.path!.orderId,request.query));
 write('confirmReturn',201,(context,request)=>confirmReturn(context,request.path!.orderId,request.body!,finance()));
 write('recordRestock',201,(context,request)=>recordRestock(context,request.path!.returnId,request.body!));
 write('voidOrder',200,(context,request)=>voidOrder(context,request.path!.orderId,request.body!,finance()));
 write('reviseOrder',201,(context,request)=>reviseOrder(context,request.path!.orderId,request.body!,finance()));
 const quoteRoute=routes.find(route=>route.operationId==='quoteOrder')!;
 app.post(quoteRoute.url,async request=>{
  const actor=await dependencies.security.requireAdmin(request);const parsed=input<'quoteOrder'>(quoteRoute,request);
  // Quote is a read. Cookie/Origin/CSRF validation is still required by its contract.
  // The security provider exposes validation through a dedicated quote guard below.
  await dependencies.security.validateReadPost(request);
  const body=await withTransaction(dependencies.pool,async client=>{await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const data=parsed.body!;return 'revision'in data?quoteRevision(client,data.orderId,data.revision,finance()):quoteNewOrder(client,data,finance());});
  return parseOperationResponse('quoteOrder',200,actor.role,body);
 });
}
