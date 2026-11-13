import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {parseSchema,projectOrderResponse,type SchemaValue} from '@huoyoupu/contracts';
import {getOrder} from '../sales/model.js';
import type {Actor,OperationContext} from '../../lib/security.js';
import {AppError} from '../../lib/errors.js';
import {appendAudit} from '../../lib/audit.js';
import {getCompany,getTemplateVersion,pageOffset,pageCursor} from './templates.js';
type Sql=Pick<PoolClient,'query'>;
export async function printData(sql:Sql,orderId:string,query:{revisionId?:string;templateVersionId?:string}={}):Promise<SchemaValue<'PrintData'>>{
 const order=await getOrder(sql,orderId,query.revisionId);
 let versionId=query.templateVersionId;
 if(!versionId){const row=(await sql.query('SELECT t.default_version_id FROM company_profiles c JOIN print_templates t ON t.id=c.default_template_id WHERE c.id=1 AND t.active')).rows[0];if(!row)throw new AppError('PRINT_LAYOUT_INVALID',422,'请先选择默认打印模板或明确模板版本');versionId=String(row.default_version_id);}
 const template=await getTemplateVersion(sql,versionId);
 // Always project employee-visible OrderPublic, including for administrators.
 return parseSchema('PrintData',{order:projectOrderResponse('employee','detail',order),company:await getCompany(sql),templateVersionId:template.id,templateVersionNo:template.versionNo,config:template.config,isCurrentOrderRevision:order.isCurrentRevision});
}
export async function getPrintJob(sql:Sql,id:string):Promise<SchemaValue<'PrintJob'>>{
 const row=(await sql.query('SELECT * FROM print_jobs WHERE id=$1',[id])).rows[0];if(!row)throw new AppError('NOT_FOUND',404,'打印请求不存在');
 return parseSchema('PrintJob',{id:row.id,orderId:row.order_id,orderRevisionId:row.order_revision_id,templateVersionId:row.template_version_id,status:row.status,operatorId:row.operator_id,requestedAt:row.requested_at.toISOString(),note:row.user_note});
}
/** This check must also run before idempotency cache lookup, using the current actor. */
export async function authorizePrintStatus(sql:Sql,id:string,actor:Actor):Promise<void>{
 const row=(await sql.query<{operator_id:string}>('SELECT operator_id FROM print_jobs WHERE id=$1',[id])).rows[0];if(!row)throw new AppError('NOT_FOUND',404,'打印请求不存在');
 if(actor.role!=='admin'&&row.operator_id!==actor.id)throw new AppError('FORBIDDEN',403,'只能填写本人发起的打印状态');
}
export async function createPrintJob(context:OperationContext,orderId:string,input:SchemaValue<'PrintJobInput'>){
 // Locking only reads the order: it never increments the commercial write version.
 const order=(await context.client.query('SELECT id FROM sales_orders WHERE id=$1 FOR SHARE',[orderId])).rows[0];if(!order)throw new AppError('NOT_FOUND',404,'订单不存在');
 const revision=(await context.client.query('SELECT id FROM order_revisions WHERE id=$1 AND order_id=$2',[input.orderRevisionId,orderId])).rows[0];if(!revision)throw new AppError('NOT_FOUND',404,'订单版本不属于该订单');
 await getTemplateVersion(context.client,input.templateVersionId);
 const id=randomUUID();await context.client.query('INSERT INTO print_jobs(id,order_id,order_revision_id,template_version_id,operator_id,client_platform,operation_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,orderId,input.orderRevisionId,input.templateVersionId,context.actor.id,input.clientPlatform,context.operationId]);
 const after=await getPrintJob(context.client,id);await appendAudit(context,{entityType:'print_job',entityId:id,after});return after;
}
export async function setPrintJobStatus(context:OperationContext,id:string,input:SchemaValue<'PrintStatusInput'>){
 await context.client.query('SELECT id FROM print_jobs WHERE id=$1 FOR UPDATE',[id]);await authorizePrintStatus(context.client,id,context.actor);const before=await getPrintJob(context.client,id);
 await context.client.query('UPDATE print_jobs SET status=$2,user_note=$3 WHERE id=$1',[id,input.status,input.note]);
 await context.client.query('INSERT INTO print_job_status_events(id,job_id,old_status,new_status,note,actor_id,operation_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),id,before.status,input.status,input.note,context.actor.id,context.operationId]);
 const after=await getPrintJob(context.client,id);await appendAudit(context,{entityType:'print_job',entityId:id,before,after});return after;
}
export async function listPrintJobs(sql:Sql,orderId:string,query:{cursor?:string;limit?:number}={}){
 if(!(await sql.query('SELECT id FROM sales_orders WHERE id=$1',[orderId])).rowCount)throw new AppError('NOT_FOUND',404,'订单不存在');
 const scope=`printJobs:${orderId}`,offset=pageOffset(scope,query.cursor),limit=query.limit??50;
 const rows=(await sql.query('SELECT id FROM print_jobs WHERE order_id=$1 ORDER BY requested_at DESC,id DESC LIMIT $2 OFFSET $3',[orderId,limit+1,offset])).rows;
 return parseSchema('PrintJobPage',{items:await Promise.all(rows.slice(0,limit).map(row=>getPrintJob(sql,row.id))),nextCursor:rows.length>limit?pageCursor(scope,offset+limit):null,asOf:new Date().toISOString()});
}
