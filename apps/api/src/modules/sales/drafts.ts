import {randomUUID} from 'node:crypto';
import type {SchemaValue} from '@huoyoupu/contracts';
import type {OperationContext} from '../../lib/security.js';
import {calculate, fail, getOrder, headerFor, loadLines, lockOrder, orderHeader, persistRevision, prepareLines, requireState, type Order} from './model.js';

export async function createDraft(context:OperationContext,input:SchemaValue<'OrderDraftInput'>):Promise<Order>{
 if(new Set(input.lines.map(line=>line.clientLineId)).size!==input.lines.length)fail('INVALID_REQUEST','重复的客户端行标识',400);
 const header=await headerFor(context.client,input);const lines=await prepareLines(context.client,input.lines);
 calculate(lines,header.discountAmount,header.roundOffAmount);
 const id=randomUUID();const revisionId=randomUUID();
 await context.client.query('INSERT INTO sales_orders(id,order_no,status,customer_id,current_revision_id,created_by) VALUES($1,$2,\'draft\',$3,$4,$5)',[id,`XS${id.replaceAll('-','').toUpperCase()}`,header.customerId,revisionId,context.actor.id]);
 await persistRevision(context,id,1,header,lines,'创建草稿',revisionId);
 return getOrder(context.client,id);
}
export async function patchDraft(context:OperationContext,id:string,input:SchemaValue<'OrderDraftPatch'>):Promise<Order>{
 const order=await lockOrder(context.client,id,input.expectedVersion);requireState(order,'draft');
 const prior=await orderHeader(context.client,order.current_revision_id);
 const selectionChanged=input.customerId!==undefined||input.addressId!==undefined||input.deliverySnapshot!==undefined;
 const header=selectionChanged?await headerFor(context.client,{customerId:input.customerId??prior.customerId,...(input.addressId?{addressId:input.addressId}:{}),...(input.deliverySnapshot?{deliverySnapshot:input.deliverySnapshot}:{}),discountAmount:input.discountAmount??prior.discountAmount,roundOffAmount:input.roundOffAmount??prior.roundOffAmount,remark:input.remark??prior.remark}):{...prior,discountAmount:input.discountAmount??prior.discountAmount,roundOffAmount:input.roundOffAmount??prior.roundOffAmount,remark:input.remark??prior.remark};
 if(input.lines&&new Set(input.lines.map(line=>line.clientLineId)).size!==input.lines.length)fail('INVALID_REQUEST','重复的客户端行标识',400);
 const lines=input.lines?await prepareLines(context.client,input.lines):await loadLines(context.client,order.current_revision_id);
 const before=await getOrder(context.client,id);
 const revisionId=await persistRevision(context,id,before.revisionNo+1,header,lines,'修改草稿');
 await context.client.query('UPDATE sales_orders SET customer_id=$2,current_revision_id=$3,version=version+1,updated_at=clock_timestamp() WHERE id=$1',[id,header.customerId,revisionId]);
 return getOrder(context.client,id);
}
export async function updateDelivery(context:OperationContext,id:string,input:SchemaValue<'DeliveryInput'>):Promise<Order>{
 const order=await lockOrder(context.client,id,input.expectedVersion);requireState(order,'confirmed');
 if(input.deliveredAt&&new Date(input.deliveredAt)>new Date())fail('INVALID_REQUEST','配送时间不能晚于当前时间',422);
 await context.client.query('UPDATE sales_orders SET delivery_status=$2,delivered_at=$3,version=version+1,updated_at=clock_timestamp() WHERE id=$1',[id,input.deliveryStatus,input.deliveryStatus==='delivered'?(input.deliveredAt??new Date().toISOString()):null]);
 return getOrder(context.client,id);
}
