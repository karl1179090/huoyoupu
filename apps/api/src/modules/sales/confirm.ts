import {randomUUID} from 'node:crypto';
import type {OperationContext} from '../../lib/security.js';
import type {FinancePort} from '../finance/port.js';
import {issueInventory, type IssueLine} from '../inventory/stock.js';
import {calculate,cents,fail,getOrder,loadLines,lockOrder,money,orderHeader,persistRevision,prepareLine,requireState,sum,type Order,type PreparedLine} from './model.js';

export async function issueLines(context:OperationContext,orderId:string,revisionId:string,lines:PreparedLine[],demands?:IssueLine[]):Promise<void>{
 const requested=demands??lines.filter(line=>!line.dto.readOnly&&line.dto.quantityBase>0).map(line=>({lineId:line.dto.id,productId:line.dto.productId,warehouseId:line.dto.warehouseId,quantityBase:line.dto.quantityBase,allocationMode:line.input.allocationMode,...(line.input.batchSelections?{batchSelections:line.input.batchSelections}:{})}));
 for(const line of lines)await context.client.query('INSERT INTO order_lines(id,order_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[line.dto.id,orderId]);
 const issued=requested.length?await issueInventory(context,{sourceId:orderId,lines:requested}):[];
 for(const source of issued){
  await context.client.query('INSERT INTO sale_allocations(id,order_id,line_id,batch_id,issue_sequence,created_revision_id,issued_quantity_base,issued_cost_amount) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[source.id,orderId,source.lineId,source.batchId,source.issueSequence,revisionId,source.quantityBase,source.costAmount]);
  const line=lines.find(line=>line.dto.id===source.lineId)!;
  line.dto.allocations.push({id:source.id,batchId:source.batchId,warehouseId:source.warehouseId,quantityBase:source.quantityBase,costAmount:source.costAmount,inputUnitCost:source.inputUnitCost,costMultiplierBase:source.multiplierBase,issueSequence:source.issueSequence});
 }
 for(const line of lines)line.dto.costAmount=money(sum(line.dto.allocations.map(allocation=>cents(allocation.costAmount))));
}

export async function confirmOrder(context:OperationContext,id:string,expectedVersion:number,finance:FinancePort):Promise<Order>{
 const order=await lockOrder(context.client,id,expectedVersion);requireState(order,'draft');
 const current=await getOrder(context.client,id);const header=await orderHeader(context.client,order.current_revision_id);
 const previous=await loadLines(context.client,order.current_revision_id);if(!previous.length)fail('ORDER_STATE_CONFLICT','空订单不能确认');
 const lines:PreparedLine[]=[];for(const line of previous)lines.push(await prepareLine(context.client,line.input,line.dto.id));
 await finance.lockAccounts(context.client,[header.customerId]);
 const revisionId=randomUUID();await issueLines(context,id,revisionId,lines);
 const totals=calculate(lines,header.discountAmount,header.roundOffAmount);
 await persistRevision(context,id,current.revisionNo+1,header,lines,'确认销售',revisionId);
 const confirmedAt=new Date();await context.client.query('UPDATE sales_orders SET status=\'confirmed\',current_revision_id=$2,confirmed_at=$3,version=version+1,updated_at=clock_timestamp() WHERE id=$1',[id,revisionId,confirmedAt]);
 const accountChanges=await finance.applyCommercial(context.client,{operationId:context.operationId,actorId:context.actor.id,orderId:id,changes:[{customerId:header.customerId,kind:'sale',sourceId:id,sourceVersion:current.revisionNo+1,amountSigned:cents(totals.totalAmount),effectiveAt:confirmedAt}]});
 return{...await getOrder(context.client,id),accountChanges};
}
