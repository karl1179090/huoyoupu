import type {FastifyInstance} from 'fastify';
import {parseOperationRequest,parseOperationResponse} from '@huoyoupu/contracts';
import type {ApiDependencies} from '../../lib/security.js';
import {queryReport,getReportRun,getReportSources,type ReportOptions} from './service.js';
export {queryReport,getReportRun,getReportSources} from './service.js';
export {normalizeReportQuery} from './query.js';
export function registerReporting(app:FastifyInstance,deps:ApiDependencies,options:ReportOptions={}):void{
 app.post('/api/v1/reports/query',async request=>{
  const actor=await deps.security.requireAdmin(request);await deps.security.validateReadPost(request);
  const input=parseOperationRequest('queryReport',{body:request.body,headers:{'X-CSRF-Token':request.headers['x-csrf-token']}});
  return parseOperationResponse('queryReport',200,actor.role,await queryReport(deps.pool,actor.id,input.body,options));
 });
 for(const [id,url,handler]of [
  ['getReportRun','/api/v1/report-runs/:reportRunId',getReportRun],
  ['getReportSources','/api/v1/report-runs/:reportRunId/sources',getReportSources],
 ]as const){app.get(url,async request=>{
  const actor=await deps.security.requireAdmin(request);const query={...request.query as Record<string,unknown>};if(typeof query.limit==='string'&&/^[1-9][0-9]*$/.test(query.limit))query.limit=Number(query.limit);
  const input=parseOperationRequest(id,{path:request.params,query});
  const result=await handler(deps.pool,input.path!.reportRunId,input.query);return parseOperationResponse(id,200,actor.role,result);
 });}
}
