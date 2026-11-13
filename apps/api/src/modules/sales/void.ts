import type {SchemaValue} from '@huoyoupu/contracts';
import type {OperationContext} from '../../lib/security.js';
import type {FinancePort} from '../finance/port.js';
import {lockStockBalances,restoreInventory} from '../inventory/stock.js';
import {sources} from './allocations.js';
import {cents,fail,getOrder,lockOrder,money,requireState} from './model.js';

/** Voiding absorbs every outstanding credit; actual cash remains a customer balance. */
export async function voidOrder(context:OperationContext,id:string,input:SchemaValue<'ReasonInput'>,finance:FinancePort){
 const order=await lockOrder(context.client,id,input.expectedVersion);requireState(order,'confirmed');
 if(order.delivery_status==='delivered')fail('ORDER_STATE_CONFLICT','已配送订单不能作废，请使用退货流程');
 const before=await getOrder(context.client,id);await finance.lockAccounts(context.client,[order.customer_id]);
 await lockStockBalances(context.client,before.lines);const all=await sources(context.client,id,true);const selections=[];
 for(const a of all){
  const q=BigInt(a.issued_quantity_base)-BigInt(a.released_quantity_base)-BigInt(a.restocked_quantity_base)-BigInt(a.void_restored_quantity_base);
  const amount=cents(a.issued_cost_amount)-cents(a.released_cost_amount)-cents(a.restocked_cost_amount)-cents(a.void_restored_cost_amount);
  if(q){selections.push({allocationId:a.id,quantityBase:Number(q),costAmount:money(amount)});await context.client.query('UPDATE sale_allocations SET void_restored_quantity_base=void_restored_quantity_base+$2,void_restored_cost_amount=void_restored_cost_amount+$3,version=version+1 WHERE id=$1',[a.id,q.toString(),money(amount)]);}
 }
 if(selections.length)await restoreInventory(context,{sourceKind:'order_void',sourceId:context.operationId,selections});
 const entries=await finance.listCommercial(context.client,id);const reversed=new Set(entries.flatMap(e=>e.reversesId?[e.reversesId]:[]));
 const changes=entries.filter(e=>e.customerId===order.customer_id&&!e.reversesId&&!reversed.has(e.id)).map(e=>({customerId:e.customerId,kind:'reversal' as const,sourceId:e.sourceId,sourceVersion:e.sourceVersion,amountSigned:-e.amountSigned,effectiveAt:e.effectiveAt,reversesId:e.id}));
 // Reverse only the residual outstanding return loss. Prior partial restorations remain immutable.
 await context.client.query(`INSERT INTO inventory_loss_entries(id,source_kind,source_id,source_line_id,batch_id,amount,effective_at,operation_id)
 SELECT gen_random_uuid(),'return_loss_void',$1,a.id,s.batch_id,-(a.cost_credit_amount-a.restocked_cost_amount),r.confirmed_at,$1
 FROM return_allocations a JOIN return_lines l ON l.id=a.return_line_id JOIN sales_returns r ON r.id=l.return_id JOIN sale_allocations s ON s.id=a.sale_allocation_id
 WHERE r.order_id=$2 AND r.status='confirmed' AND l.restock_disposition='not_returning' AND a.cost_credit_amount<>a.restocked_cost_amount`,[context.operationId,id]);
 await context.client.query(`UPDATE sales_returns SET status='absorbed_by_void',absorbed_operation_id=$2,version=version+1 WHERE order_id=$1 AND status='confirmed'`,[id,context.operationId]);
 await context.client.query(`UPDATE sales_orders SET status='voided',void_reason=$2,void_operation_id=$3,version=version+1,updated_at=clock_timestamp() WHERE id=$1`,[id,input.reason,context.operationId]);
 const accountChanges=await finance.applyCommercial(context.client,{operationId:context.operationId,actorId:context.actor.id,orderId:id,changes});
 return{...await getOrder(context.client,id),accountChanges};
}
