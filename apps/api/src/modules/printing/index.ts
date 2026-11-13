import {withTransaction} from '@huoyoupu/database';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import {openapiDocument,parseSchema,parseOperationRequest,parseOperationResponse,type OperationId,type OperationRequest} from '@huoyoupu/contracts';
import type {ApiDependencies,OperationContext} from '../../lib/security.js';
import * as templates from './templates.js';
import * as jobs from './jobs.js';
export {currentRevisionPrintStatus} from './state.js';
export function registerPrinting(app:FastifyInstance,deps:ApiDependencies):void{
 const routes=new Map<OperationId,{method:string;url:string;headers:string[]}>();
 for(const [path,item]of Object.entries(openapiDocument.paths))for(const [method,definition]of Object.entries(item)){
  const op=definition as {operationId?:OperationId;parameters?:({$ref?:string;in?:string;name?:string})[]};if(!op.operationId)continue;
  routes.set(op.operationId,{method:method.toUpperCase(),url:`/api/v1${path.replace(/\{([^}]+)\}/g,':$1')}`,headers:(op.parameters??[]).flatMap(p=>p.$ref?(p.$ref.endsWith('CsrfToken')?['X-CSRF-Token']:p.$ref.endsWith('IdempotencyKey')?['Idempotency-Key']:[]):p.in==='header'&&p.name?[p.name]:[])});
 }
 function input<O extends OperationId>(id:O,request:FastifyRequest):OperationRequest<O>{
  const query={...request.query as Record<string,unknown>};if(typeof query.limit==='string'&&/^[1-9][0-9]*$/.test(query.limit))query.limit=Number(query.limit);
  const headers=Object.fromEntries(routes.get(id)!.headers.map(name=>[name,request.headers[name.toLowerCase()]]));
  return parseOperationRequest(id,{path:request.params??{},query,headers,...(request.body===undefined?{}:{body:request.body})});
 }
 function read<O extends OperationId>(id:O,handler:(request:OperationRequest<O>,role:'admin'|'employee')=>Promise<unknown>){const route=routes.get(id)!;
  app.get(route.url,async request=>{const actor=await deps.security.requireUser(request);return parseOperationResponse(id,200,actor.role,await handler(input(id,request),actor.role));});
 }
 function write<O extends OperationId>(id:O,status:number,handler:(context:OperationContext,request:OperationRequest<O>)=>Promise<unknown>,employee=false){const route=routes.get(id)!;
  app.route({method:route.method as 'POST'|'PATCH',url:route.url,handler:async(request,reply)=>{
   const actor=employee?await deps.security.requireUser(request):await deps.security.requireAdmin(request);
   if(id==='setPrintJobStatus'){
    // Validate the target path independently before a potentially privileged cached response.
    const parsedPath=(request.params as {printJobId:string}).printJobId;
    // Reject malformed UUID before passing it to PostgreSQL; full structure is cached inside work.
    parseSchema('Id',parsedPath);
    await jobs.authorizePrintStatus(deps.pool,parsedPath,actor);
   }
   const result=await deps.security.withOperation(request,{kind:id,routeKey:`${route.method}:${route.url}`,...(employee?{allowedRoles:['admin','employee'] as const}:{})},async context=>({status,body:parseOperationResponse(id,status,context.actor.role,await handler(context,input(id,request)))}));
   if(result.replayed)reply.header('Idempotency-Replayed','true');return reply.code(result.status).send(result.body);
  }});
 }
 read('getCompany',()=>templates.getCompany(deps.pool));
 read('listPrintTemplates',(request,role)=>templates.listTemplates(deps.pool,role,request.query));
 read('listPrintTemplateVersions',(request,role)=>templates.listTemplateVersions(deps.pool,request.path!.templateId,role,request.query));
 read('getPrintTemplateVersion',request=>templates.getTemplateVersion(deps.pool,request.path!.templateVersionId,request.path!.templateId));
 read('getPrintData',request=>withTransaction(deps.pool,async client=>{await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');return jobs.printData(client,request.path!.orderId,request.query);}));
 read('listPrintJobs',request=>jobs.listPrintJobs(deps.pool,request.path!.orderId,request.query));
 write('updateCompany',200,(context,request)=>templates.patchCompany(context,request.body!));
 write('createPrintTemplate',201,(context,request)=>templates.createTemplate(context,request.body!));
 write('updatePrintTemplate',200,(context,request)=>templates.patchTemplate(context,request.path!.templateId,request.body!));
 write('createPrintTemplateVersion',201,(context,request)=>templates.createTemplateVersion(context,request.path!.templateId,request.body!));
 write('createPrintJob',201,(context,request)=>jobs.createPrintJob(context,request.path!.orderId,request.body!),true);
 write('setPrintJobStatus',200,(context,request)=>jobs.setPrintJobStatus(context,request.path!.printJobId,request.body!),true);
}
