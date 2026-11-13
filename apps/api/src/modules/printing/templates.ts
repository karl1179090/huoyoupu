import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {parseSchema,type SchemaValue} from '@huoyoupu/contracts';
import type {OperationContext} from '../../lib/security.js';
import {appendAudit} from '../../lib/audit.js';
import {AppError} from '../../lib/errors.js';
import {validatePrintConfig} from './config.js';
type Sql=Pick<PoolClient,'query'>;
export type Template=SchemaValue<'PrintTemplate'>;
function notFound():never{throw new AppError('NOT_FOUND',404,'打印模板不存在');}
function version(actual:number,expected:number){if(actual!==expected)throw new AppError('VERSION_CONFLICT',409,'打印配置版本已变化',{currentVersion:actual});}
export async function getCompany(sql:Sql):Promise<SchemaValue<'Company'>>{
 const row=(await sql.query('SELECT name,phone,address,version FROM company_profiles WHERE id=1')).rows[0]!;return parseSchema('Company',{...row,version:Number(row.version)});
}
export async function patchCompany(context:OperationContext,input:SchemaValue<'CompanyPatch'>){
 await context.client.query('SELECT id FROM company_profiles WHERE id=1 FOR UPDATE');const before=await getCompany(context.client);version(before.version,input.expectedVersion);
 await context.client.query('UPDATE company_profiles SET name=$1,phone=$2,address=$3,version=version+1 WHERE id=1',[input.name??before.name,input.phone??before.phone,input.address??before.address]);
 const after=await getCompany(context.client);await appendAudit(context,{entityType:'company',oldVersion:before.version,newVersion:after.version,before,after});return after;
}
export async function getTemplate(sql:Sql,id:string):Promise<Template>{
 const row=(await sql.query<{data:Template}>(`SELECT jsonb_build_object('id',t.id,'name',t.name,'active',t.active,'isDefault',c.default_template_id=t.id,'version',t.version,'currentTemplateVersionId',v.id,'currentTemplateVersionNo',v.version_no,'config',v.config_json) AS data FROM print_templates t JOIN print_template_versions v ON v.id=t.default_version_id CROSS JOIN company_profiles c WHERE t.id=$1`,[id])).rows[0];
 if(!row)notFound();return parseSchema('PrintTemplate',{...row.data,isDefault:row.data.isDefault??false});
}
export async function getTemplateVersion(sql:Sql,id:string,templateId?:string):Promise<SchemaValue<'PrintTemplateVersion'>>{
 const row=(await sql.query('SELECT * FROM print_template_versions WHERE id=$1 AND ($2::uuid IS NULL OR template_id=$2)',[id,templateId??null])).rows[0];if(!row)notFound();
 return parseSchema('PrintTemplateVersion',{id:row.id,templateId:row.template_id,versionNo:Number(row.version_no),config:row.config_json,createdAt:row.created_at.toISOString()});
}
/** Company row is the common first lock for all default/template updates. */
async function lockTemplate(context:OperationContext,id:string,expected:number){
 await context.client.query('SELECT id FROM company_profiles WHERE id=1 FOR UPDATE');const row=(await context.client.query('SELECT id FROM print_templates WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row)notFound();const before=await getTemplate(context.client,id);version(before.version,expected);return before;
}
export async function createTemplate(context:OperationContext,input:SchemaValue<'TemplateCreate'>){
 const config=validatePrintConfig(input.config);await context.client.query('SELECT id FROM company_profiles WHERE id=1 FOR UPDATE');
 const id=randomUUID(),versionId=randomUUID();await context.client.query('INSERT INTO print_templates(id,name,default_version_id) VALUES($1,$2,$3)',[id,input.name,versionId]);
 await context.client.query('INSERT INTO print_template_versions(id,template_id,version_no,config_json,created_by) VALUES($1,$2,1,$3,$4)',[versionId,id,JSON.stringify(config),context.actor.id]);
 const after=await getTemplate(context.client,id);await appendAudit(context,{entityType:'print_template',entityId:id,newVersion:1,after});return after;
}
export async function patchTemplate(context:OperationContext,id:string,input:SchemaValue<'TemplatePatch'>){
 const before=await lockTemplate(context,id,input.expectedVersion);const active=input.active??before.active;
 if(input.isDefault===true&&!active)throw new AppError('PRINT_LAYOUT_INVALID',422,'停用模板不能设为默认');
 await context.client.query('UPDATE print_templates SET name=$2,active=$3,version=version+1 WHERE id=$1',[id,input.name??before.name,active]);
 if(input.isDefault===true){
  const oldDefault=(await context.client.query<{default_template_id:string|null}>('SELECT default_template_id FROM company_profiles WHERE id=1')).rows[0]!.default_template_id;
  const previous=oldDefault&&oldDefault!==id?await getTemplate(context.client,oldDefault):null;
  await context.client.query('UPDATE company_profiles SET default_template_id=$1 WHERE id=1',[id]);
  if(previous){
   await context.client.query('UPDATE print_templates SET version=version+1 WHERE id=$1',[previous.id]);const changed=await getTemplate(context.client,previous.id);
   await appendAudit(context,{entityType:'print_template',entityId:previous.id,oldVersion:previous.version,newVersion:changed.version,before:previous,after:changed});
  }
 }
 else if(input.isDefault===false||!active)await context.client.query('UPDATE company_profiles SET default_template_id=NULL WHERE id=1 AND default_template_id=$1',[id]);
 const after=await getTemplate(context.client,id);await appendAudit(context,{entityType:'print_template',entityId:id,oldVersion:before.version,newVersion:after.version,before,after});return after;
}
export async function createTemplateVersion(context:OperationContext,id:string,input:SchemaValue<'TemplateVersionInput'>){
 const config=validatePrintConfig(input.config),before=await lockTemplate(context,id,input.expectedVersion);const versionId=randomUUID();
 await context.client.query('INSERT INTO print_template_versions(id,template_id,version_no,config_json,created_by) VALUES($1,$2,$3,$4,$5)',[versionId,id,before.currentTemplateVersionNo+1,JSON.stringify(config),context.actor.id]);
 await context.client.query('UPDATE print_templates SET default_version_id=$2,version=version+1 WHERE id=$1',[id,versionId]);const after=await getTemplate(context.client,id);
 await appendAudit(context,{entityType:'print_template',entityId:id,oldVersion:before.version,newVersion:after.version,before,after});return after;
}
export function pageOffset(scope:string,cursor?:string):number{
 if(!cursor)return 0;try{const v=JSON.parse(Buffer.from(cursor,'base64url').toString());if(v.scope!==scope||!Number.isSafeInteger(v.offset)||v.offset<0)throw new Error();return v.offset as number;}catch{throw new AppError('INVALID_REQUEST',400,'打印分页游标无效');}
}
export const pageCursor=(scope:string,offset:number)=>Buffer.from(JSON.stringify({scope,offset})).toString('base64url');
export async function listTemplates(sql:Sql,role:'admin'|'employee',query:{cursor?:string;limit?:number}={}){
 const scope=`templates:${role}`,offset=pageOffset(scope,query.cursor),limit=query.limit??50;
 const rows=(await sql.query('SELECT id FROM print_templates WHERE ($1 OR active) ORDER BY id LIMIT $2 OFFSET $3',[role==='admin',limit+1,offset])).rows;
 return parseSchema('TemplatePage',{items:await Promise.all(rows.slice(0,limit).map(row=>getTemplate(sql,row.id))),asOf:new Date().toISOString(),nextCursor:rows.length>limit?pageCursor(scope,offset+limit):null});
}
export async function listTemplateVersions(sql:Sql,id:string,role:'admin'|'employee',query:{cursor?:string;limit?:number}={}){
 const template=await getTemplate(sql,id);if(role==='employee'&&!template.active)notFound();const scope=`templateVersions:${id}`,offset=pageOffset(scope,query.cursor),limit=query.limit??50;
 const rows=(await sql.query('SELECT id FROM print_template_versions WHERE template_id=$1 ORDER BY version_no DESC LIMIT $2 OFFSET $3',[id,limit+1,offset])).rows;
 return parseSchema('TemplateVersionPage',{items:await Promise.all(rows.slice(0,limit).map(row=>getTemplateVersion(sql,row.id,id))),asOf:new Date().toISOString(),nextCursor:rows.length>limit?pageCursor(scope,offset+limit):null});
}
