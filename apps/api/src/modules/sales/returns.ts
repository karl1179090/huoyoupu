import {randomUUID} from 'node:crypto';
import type {SchemaValue} from '@huoyoupu/contracts';
import {allocateFromSource} from '@huoyoupu/money';
import type {OperationContext} from '../../lib/security.js';
import type {FinancePort} from '../finance/port.js';
import {lockStockBalances,restoreInventory} from '../inventory/stock.js';
import {returnAmounts} from './amounts.js';
import {claimCost,selectForLine,sources} from './allocations.js';
import {cents,fail,loadLines,lockOrder,money,orderHeader,requireState,timestamp,type Sql} from './model.js';

export async function getReturn(sql:Sql,id:string):Promise<SchemaValue<'SalesReturn'>>{
 const r=(await sql.query(`SELECT r.*,o.version AS order_version FROM sales_returns r JOIN sales_orders o ON o.id=r.order_id WHERE r.id=$1`,[id])).rows[0];if(!r)fail('NOT_FOUND','退货不存在',404);
 const raw=(await sql.query('SELECT * FROM return_lines WHERE return_id=$1 ORDER BY id',[id])).rows;
 const lines=[];
 for(const line of raw){const allocations=(await sql.query(`SELECT a.*,s.batch_id,b.warehouse_id FROM return_allocations a JOIN sale_allocations s ON s.id=a.sale_allocation_id JOIN inventory_batches b ON b.id=s.batch_id WHERE a.return_line_id=$1 ORDER BY a.id`,[line.id])).rows.map(a=>({id:a.id,saleAllocationId:a.sale_allocation_id,batchId:a.batch_id,warehouseId:a.warehouse_id,quantityBase:Number(a.quantity_base),returnAmount:a.return_amount,costCreditAmount:a.cost_credit_amount,restockedQuantityBase:Number(a.restocked_quantity_base)}));lines.push({id:line.id,lineId:line.order_line_id,quantityBase:Number(line.quantity_base),returnAmount:line.return_amount,costCreditAmount:line.cost_credit_amount,restockDisposition:line.restock_disposition,restockedQuantityBase:Number(line.restocked_quantity_base),allocations});}
 const refunded=(await sql.query(`SELECT COALESCE(sum(amount),0)::numeric(20,2)::text AS amount FROM cash_events WHERE related_return_id=$1 AND kind='refund' AND status='active'`,[id])).rows[0]!.amount;
 return{id:r.id,returnNo:r.return_no,orderId:r.order_id,sourceRevisionId:r.source_revision_id,orderVersion:Number(r.order_version),version:Number(r.version),status:r.status,confirmedAt:timestamp(r.confirmed_at),returnAmount:money(lines.reduce((v,l)=>v+cents(l.returnAmount),0n)),costCreditAmount:money(lines.reduce((v,l)=>v+cents(l.costCreditAmount),0n)),refundedAmount:refunded,lines,customerIdAtConfirmation:r.customer_id_at_confirmation,customerNameAtConfirmation:r.customer_name_at_confirmation};
}
export async function confirmReturn(context:OperationContext,orderId:string,input:SchemaValue<'ReturnInput'>,finance:FinancePort):Promise<SchemaValue<'SalesReturn'>>{
 const order=await lockOrder(context.client,orderId,input.expectedVersion);requireState(order,'confirmed');
 const lines=await loadLines(context.client,order.current_revision_id);const header=await orderHeader(context.client,order.current_revision_id);
 await finance.lockAccounts(context.client,[order.customer_id]);
 const all=await sources(context.client,orderId,true);const id=randomUUID();
 const record=(await context.client.query(`INSERT INTO sales_returns(id,return_no,order_id,source_revision_id,customer_id_at_confirmation,customer_name_at_confirmation,operation_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING confirmed_at`,[id,`R-${id}`,orderId,order.current_revision_id,order.customer_id,header.deliverySnapshot.customerName,context.operationId,input.reason])).rows[0]!;
 const seen=new Set<string>();let credit=0n;
 for(const requested of input.lines){
  if(seen.has(requested.lineId))fail('INVALID_REQUEST','退货明细不能重复',400);seen.add(requested.lineId);
  const line=lines.find(l=>l.dto.id===requested.lineId);if(!line||line.dto.readOnly)fail('RELATED_RECORD_CONFLICT','退货必须选择当前可退原行');
  if(requested.quantityBase>line.dto.quantityBase-line.dto.returnedQuantityBase)fail('RETURN_EXCEEDS_SOURCE','退货数量超过剩余可退数量',422);
  const {net,subtotal,discount}=returnAmounts({quantity:BigInt(line.dto.quantityBase),subtotal:cents(line.dto.subtotalAmount),net:cents(line.dto.netAmount),returnedQuantity:BigInt(line.dto.returnedQuantityBase),returnedSubtotal:cents(line.returnedSubtotal),returnedNet:cents(line.returnedNet)},BigInt(requested.quantityBase));
  const chosen=selectForLine(line,all,requested.quantityBase,requested.allocationSelections);let allocatedQuantity=0n;let allocatedAmount=0n;const lineId=randomUUID();let cost=0n;
  const allocationRecords=[];
  for(const choice of chosen){
   const netShare=allocateFromSource({quantity:BigInt(requested.quantityBase),amount:net,allocatedQuantity,allocatedAmount},BigInt(choice.quantityBase));allocatedQuantity=netShare.source.allocatedQuantity;allocatedAmount=netShare.source.allocatedAmount;
   const source=all.find(s=>s.id===choice.allocationId)!;const amount=claimCost(source,BigInt(choice.quantityBase));cost+=amount;const allocationId=randomUUID();
   source.returned_quantity_base=(BigInt(source.returned_quantity_base)+BigInt(choice.quantityBase)).toString();source.return_credit_cost_amount=money(cents(source.return_credit_cost_amount)+amount);
   await context.client.query('UPDATE sale_allocations SET returned_quantity_base=$2,return_credit_cost_amount=$3,version=version+1 WHERE id=$1',[source.id,source.returned_quantity_base,source.return_credit_cost_amount]);
   allocationRecords.push({id:allocationId,source,quantity:choice.quantityBase,cost:money(amount),net:money(netShare.amount)});
  }
  await context.client.query(`INSERT INTO return_lines(id,return_id,order_line_id,source_revision_line_id,quantity_base,return_amount,subtotal_credit_amount,discount_credit_amount,cost_credit_amount,restock_disposition) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[lineId,id,line.dto.id,line.rowId,requested.quantityBase,money(net),money(subtotal),money(discount),money(cost),requested.restockDisposition??'pending']);
  for(const a of allocationRecords){
   await context.client.query(`INSERT INTO return_allocations(id,return_line_id,sale_allocation_id,quantity_base,return_amount,cost_credit_amount) VALUES($1,$2,$3,$4,$5,$6)`,[a.id,lineId,a.source.id,a.quantity,a.net,a.cost]);
   if(requested.restockDisposition==='not_returning')await context.client.query(`INSERT INTO inventory_loss_entries(id,source_kind,source_id,source_line_id,batch_id,amount,effective_at,operation_id) VALUES(gen_random_uuid(),'return_not_returning',$1,$2,$3,$4,$5,$6)`,[id,a.id,a.source.batch_id,a.cost,record.confirmed_at,context.operationId]);
  }
  await context.client.query(`UPDATE revision_lines SET returned_quantity_base=returned_quantity_base+$2,returned_net_amount=returned_net_amount+$3,returned_subtotal_amount=returned_subtotal_amount+$4,returned_discount_amount=returned_discount_amount+$5,returned_cost_amount=returned_cost_amount+$6 WHERE id=$1`,[line.rowId,requested.quantityBase,money(net),money(subtotal),money(discount),money(cost)]);credit+=net;
 }
 await context.client.query('UPDATE sales_orders SET version=version+1,updated_at=clock_timestamp() WHERE id=$1',[orderId]);
 await finance.applyCommercial(context.client,{operationId:context.operationId,actorId:context.actor.id,orderId,changes:[{customerId:order.customer_id,kind:'return',sourceId:id,sourceVersion:1,amountSigned:-credit,effectiveAt:record.confirmed_at}]});
 return getReturn(context.client,id);
}

export async function recordRestock(context:OperationContext,id:string,input:SchemaValue<'RestockInput'>):Promise<SchemaValue<'Restock'>>{
 const initial=(await context.client.query('SELECT order_id FROM sales_returns WHERE id=$1',[id])).rows[0];if(!initial)fail('NOT_FOUND','退货不存在',404);
 await lockOrder(context.client,initial.order_id);
 const r=(await context.client.query('SELECT * FROM sales_returns WHERE id=$1 FOR UPDATE',[id])).rows[0]!;
 if(Number(r.version)!==input.expectedVersion)fail('VERSION_CONFLICT','退货状态已变化');if(r.status!=='confirmed')fail('ORDER_STATE_CONFLICT','已被作废吸收的退货不能继续返库');
 const at=new Date(input.restockedAt);if(at>new Date())fail('INVALID_REQUEST','实际返库时间不能晚于当前时间',422);
 const rows=(await context.client.query(`SELECT a.*,l.return_id,l.restock_disposition,s.batch_id,b.product_id,b.warehouse_id FROM return_allocations a JOIN return_lines l ON l.id=a.return_line_id JOIN sale_allocations s ON s.id=a.sale_allocation_id JOIN inventory_batches b ON b.id=s.batch_id WHERE l.return_id=$1 ORDER BY a.id`,[id])).rows;
 await lockStockBalances(context.client,rows.map(a=>({productId:a.product_id,warehouseId:a.warehouse_id})));
 await sources(context.client,r.order_id,true);
 const eventId=randomUUID();const event=(await context.client.query(`INSERT INTO restock_events(id,return_id,restocked_at,operator_id,operation_id,reason) VALUES($1,$2,$3,$4,$5,$6) RETURNING recorded_at`,[eventId,id,at,context.actor.id,context.operationId,input.reason??''])).rows[0]!;
 const seen=new Set<string>();const selections=[];const result=[];
 for(const requested of input.lines){
  if(seen.has(requested.returnAllocationId))fail('INVALID_REQUEST','返库来源不能重复',400);seen.add(requested.returnAllocationId);
  const a=rows.find(row=>row.id===requested.returnAllocationId);if(!a||requested.quantityBase>Number(a.quantity_base)-Number(a.restocked_quantity_base))fail('RETURN_EXCEEDS_SOURCE','返库数量超过该退货来源剩余数量',422);
  const cost=allocateFromSource({quantity:BigInt(a.quantity_base),amount:cents(a.cost_credit_amount),allocatedQuantity:BigInt(a.restocked_quantity_base),allocatedAmount:cents(a.restocked_cost_amount)},BigInt(requested.quantityBase)).amount;
  const amount=money(cost);selections.push({allocationId:a.sale_allocation_id,quantityBase:requested.quantityBase,costAmount:amount});result.push({returnAllocationId:a.id,quantityBase:requested.quantityBase,costAmount:amount});
  await context.client.query('INSERT INTO restock_lines(id,restock_event_id,return_allocation_id,quantity_base,cost_amount) VALUES(gen_random_uuid(),$1,$2,$3,$4)',[eventId,a.id,requested.quantityBase,amount]);
  await context.client.query('UPDATE return_allocations SET restocked_quantity_base=restocked_quantity_base+$2,restocked_cost_amount=restocked_cost_amount+$3 WHERE id=$1',[a.id,requested.quantityBase,amount]);
  await context.client.query('UPDATE return_lines SET restocked_quantity_base=restocked_quantity_base+$2,version=version+1 WHERE id=$1',[a.return_line_id,requested.quantityBase]);
  await context.client.query('UPDATE sale_allocations SET restocked_quantity_base=restocked_quantity_base+$2,restocked_cost_amount=restocked_cost_amount+$3,version=version+1 WHERE id=$1',[a.sale_allocation_id,requested.quantityBase,amount]);
  if(a.restock_disposition==='not_returning')await context.client.query(`INSERT INTO inventory_loss_entries(id,source_kind,source_id,source_line_id,batch_id,amount,effective_at,operation_id) VALUES(gen_random_uuid(),'return_loss_restock',$1,$2,$3,$4,$5,$6)`,[eventId,a.id,a.batch_id,money(-cost),at,context.operationId]);
 }
 await restoreInventory(context,{sourceKind:'return_restock',sourceId:eventId,selections});
 await context.client.query('UPDATE sales_returns SET version=version+1 WHERE id=$1',[id]);
 return{id:eventId,returnId:id,returnVersion:Number(r.version)+1,restockedAt:timestamp(at),recordedAt:timestamp(event.recorded_at),lines:result};
}
export async function listOrderReturns(sql:Sql,orderId:string,options:{limit?:number;cursor?:string}={}):Promise<SchemaValue<'ReturnPage'>>{
 const limit=options.limit??50;let after:string|null=null;
 if(options.cursor){try{const parsed=JSON.parse(Buffer.from(options.cursor,'base64url').toString());if(parsed[0]!==orderId||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(parsed[1]))throw new Error();after=parsed[1];}catch{fail('INVALID_REQUEST','退货分页游标无效',400);}}
 const rows=(await sql.query('SELECT id FROM sales_returns WHERE order_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3',[orderId,after,limit+1])).rows;
 const items=[];for(const row of rows.slice(0,limit))items.push(await getReturn(sql,row.id));
 return{items,nextCursor:rows.length>limit?Buffer.from(JSON.stringify([orderId,items.at(-1)!.id])).toString('base64url'):null,asOf:new Date().toISOString()};
}
