import {randomUUID} from 'node:crypto';
import type {Pool, PoolClient} from 'pg';
import {parseSchema, type SchemaValue} from '@huoyoupu/contracts';
import {allocateDiscount, amountForBaseQuantity, formatMoney, parseMoney, parseUnitPrice, sumQuantities, toBaseQuantity} from '@huoyoupu/money';
import type {OperationContext} from '../../lib/security.js';
import {AppError} from '../../lib/errors.js';
import {currentRevisionPrintStatus} from '../printing/state.js';
import {getCatalog, resolveDeliverySnapshot} from '../catalog/service.js';

export type Sql = Pick<Pool | PoolClient, 'query'>;
export type Order = SchemaValue<'OrderAdmin'>;
export type Line = SchemaValue<'OrderLineAdmin'>;
export type NewLine = SchemaValue<'NewOrderLine'>;
export type StoredLineInput=NewLine&{pricingBasis?:{price:string;multiplier:number}};
export interface PreparedLine {
 dto: Line; input: StoredLineInput; rowId?: string;
 quoteSourceLineId?:string;
 returnedNet: string; returnedSubtotal: string; returnedDiscount: string; returnedCost: string;
}
export interface OrderRow {id:string;order_no:string;status:Order['status'];customer_id:string;current_revision_id:string;version:string;confirmed_at:Date|null;delivery_status:Order['deliveryStatus'];delivered_at:Date|null;created_at:Date;updated_at:Date}
export interface Header {customerId:string;addressId?:string;deliverySnapshot:SchemaValue<'AddressSnapshot'>;discountAmount:string;roundOffAmount:string;remark:string}
export function fail(code:string,message:string,status=409):never {throw new AppError(code,status,message);}
export const cents=(value:string)=>parseMoney(value);
export const money=(value:bigint)=>formatMoney(value);
export const timestamp=(value:Date|string)=>new Date(value).toISOString();
export const sum=(items:readonly bigint[])=>items.reduce((a,b)=>a+b,0n);
export function requireState(order:OrderRow,status:Order['status']):void {if(order.status!==status)fail('ORDER_STATE_CONFLICT','订单状态不适用于此操作');}
export async function lockOrder(client:PoolClient,id:string,expectedVersion?:number):Promise<OrderRow>{
 const result=await client.query<OrderRow>('SELECT * FROM sales_orders WHERE id=$1 FOR UPDATE',[id]);
 const order=result.rows[0];if(!order)fail('NOT_FOUND','订单不存在',404);
 if(expectedVersion!==undefined&&Number(order.version)!==expectedVersion)throw new AppError('VERSION_CONFLICT',409,'订单已变化，请刷新',{expectedVersion,actualVersion:Number(order.version)});
 return order;
}
export async function prepareLine(sql:Sql,input:StoredLineInput,id:string=randomUUID(),allowInactive=false):Promise<PreparedLine>{
 const product=await getCatalog(sql,'Product',input.productId);const unit=product.units.find(unit=>unit.id===input.unitId);
 const warehouse=await getCatalog(sql,'Warehouse',input.warehouseId);
 if(!unit)fail('NOT_FOUND','单位不属于该商品',404);
 if(!allowInactive&&(!product.active||!unit.active||!warehouse.active))fail('RELATED_RECORD_CONFLICT','停用商品、单位或仓库不能用于新增交易');
 let quantityBase:number;
 try{quantityBase=Number(toBaseQuantity(input.quantity,unit.multiplierBase));}catch{fail('INVALID_QUANTITY','数量换算超出安全整数范围',422);}
 const basis=input.pricingBasis??{price:input.unitPrice,multiplier:unit.multiplierBase};
 const subtotal=amountForBaseQuantity(parseUnitPrice(basis.price),BigInt(basis.multiplier),BigInt(quantityBase));
 return {input:{...input},returnedNet:'0.00',returnedSubtotal:'0.00',returnedDiscount:'0.00',returnedCost:'0.00',dto:{id,kind:'normal',readOnly:false,productId:product.id,productName:product.name,specification:product.specification,warehouseId:warehouse.id,warehouseName:warehouse.name,unitId:unit.id,unitName:unit.name,quantity:input.quantity,quantityBase,multiplierBase:unit.multiplierBase,unitPrice:input.unitPrice,subtotalAmount:money(subtotal),discountAllocatedAmount:'0.00',netAmount:money(subtotal),returnedQuantityBase:0,remark:input.remark??'',costAmount:'0.00',grossProfit:money(subtotal),allocations:[]}};
}
/** A transaction owns one PostgreSQL connection; issue its reads sequentially. */
export async function prepareLines(sql:Sql,inputs:readonly StoredLineInput[]):Promise<PreparedLine[]>{
 const lines:PreparedLine[]=[];for(const input of inputs)lines.push(await prepareLine(sql,input));return lines;
}
export function calculate(lines:PreparedLine[],discountAmount:string,roundOffAmount:string):Pick<Order,'subtotalAmount'|'discountAmount'|'roundOffAmount'|'totalAmount'|'costAmount'|'grossProfit'>{
 try{sumQuantities(lines.map(line=>BigInt(line.dto.quantityBase)));}catch{fail('INVALID_QUANTITY','订单基础数量合计超出范围',422);}
 const locked=lines.filter(line=>line.dto.readOnly);const editable=lines.filter(line=>!line.dto.readOnly);
 const discount=cents(discountAmount)+cents(roundOffAmount);const lockedDiscount=sum(locked.map(line=>cents(line.dto.discountAllocatedAmount)));
 if(discount<lockedDiscount)fail('RELATED_RECORD_CONFLICT','整单减免不能抹除已退历史的锁定优惠');
 let shares:bigint[];
 try{shares=allocateDiscount(editable.map(line=>cents(line.dto.subtotalAmount)),discount-lockedDiscount);}catch{fail('DISCOUNT_EXCEEDS_AMOUNT','优惠与抹零超过可减免金额',422);}
 editable.forEach((line,index)=>{line.dto.discountAllocatedAmount=money(shares[index]!);line.dto.netAmount=money(cents(line.dto.subtotalAmount)-shares[index]!);line.dto.grossProfit=money(cents(line.dto.netAmount)-cents(line.dto.costAmount));});
 const subtotal=sum(lines.map(line=>cents(line.dto.subtotalAmount)));const cost=sum(lines.map(line=>cents(line.dto.costAmount)));
 return{subtotalAmount:money(subtotal),discountAmount,roundOffAmount,totalAmount:money(subtotal-discount),costAmount:money(cost),grossProfit:money(subtotal-discount-cost)};
}
export async function headerFor(sql:Sql,input:{customerId:string;addressId?:string;deliverySnapshot?:SchemaValue<'AddressSnapshot'>;discountAmount:string;roundOffAmount:string;remark?:string}):Promise<Header>{
 const customer=await getCatalog(sql,'Customer',input.customerId);if(!customer.active)fail('RELATED_RECORD_CONFLICT','停用客户不能用于新增交易');
 const deliverySnapshot=await resolveDeliverySnapshot(sql,input.customerId,input.addressId,input.deliverySnapshot);
 return{customerId:input.customerId,...(input.addressId?{addressId:input.addressId}:{}),deliverySnapshot,discountAmount:input.discountAmount,roundOffAmount:input.roundOffAmount,remark:input.remark??''};
}
export async function loadLines(sql:Sql,revisionId:string):Promise<PreparedLine[]>{
 const result=await sql.query<{id:string;snapshot:Line;allocation_input:StoredLineInput;returned_quantity_base:string;returned_net_amount:string;returned_subtotal_amount:string;returned_discount_amount:string;returned_cost_amount:string}>('SELECT * FROM revision_lines WHERE revision_id=$1 ORDER BY position',[revisionId]);
 return result.rows.map(row=>({rowId:row.id,input:row.allocation_input,dto:{...row.snapshot,returnedQuantityBase:Number(row.returned_quantity_base)},returnedNet:row.returned_net_amount,returnedSubtotal:row.returned_subtotal_amount,returnedDiscount:row.returned_discount_amount,returnedCost:row.returned_cost_amount}));
}
export async function persistRevision(context:OperationContext,orderId:string,revisionNo:number,header:Header,lines:PreparedLine[],reason:string,revisionId:string=randomUUID()):Promise<string>{
 const totals=calculate(lines,header.discountAmount,header.roundOffAmount);
 await context.client.query(`INSERT INTO order_revisions(id,order_id,revision_no,customer_id,address_id,customer_snapshot,address_snapshot,subtotal_amount,discount_amount,round_off_amount,total_amount,cost_amount,gross_profit,remark,change_reason,created_by,operation_id) VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,[revisionId,orderId,revisionNo,header.customerId,header.addressId??null,JSON.stringify(header.deliverySnapshot),totals.subtotalAmount,totals.discountAmount,totals.roundOffAmount,totals.totalAmount,totals.costAmount,totals.grossProfit,header.remark,reason,context.actor.id,context.operationId]);
 for(const [position,line] of lines.entries()){
  await context.client.query('INSERT INTO order_lines(id,order_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[line.dto.id,orderId]);
  const rowId=randomUUID();line.rowId=rowId;
  await context.client.query(`INSERT INTO revision_lines(id,revision_id,line_id,position,kind,product_id,warehouse_id,unit_id,input_quantity,quantity_base,multiplier_snapshot,unit_price,subtotal_amount,discount_allocated,net_amount,cost_amount,gross_profit,snapshot,allocation_input,returned_quantity_base,returned_net_amount,returned_subtotal_amount,returned_discount_amount,returned_cost_amount) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,[rowId,revisionId,line.dto.id,position,line.dto.kind,line.dto.productId,line.dto.warehouseId,line.dto.unitId,line.dto.quantity,line.dto.quantityBase,line.dto.multiplierBase,line.dto.unitPrice,line.dto.subtotalAmount,line.dto.discountAllocatedAmount,line.dto.netAmount,line.dto.costAmount,line.dto.grossProfit,JSON.stringify(line.dto),JSON.stringify(line.input),line.dto.returnedQuantityBase,line.returnedNet,line.returnedSubtotal,line.returnedDiscount,line.returnedCost]);
  for(const allocation of line.dto.allocations)await context.client.query('INSERT INTO revision_allocation_links(revision_line_id,sale_allocation_id,quantity_base,cost_amount) VALUES($1,$2,$3,$4)',[rowId,allocation.id,allocation.quantityBase,allocation.costAmount]);
 }
 return revisionId;
}
export async function getOrder(sql:Sql,id:string,revisionId?:string):Promise<Order>{
 const result=await sql.query<OrderRow>('SELECT * FROM sales_orders WHERE id=$1',[id]);const row=result.rows[0];if(!row)fail('NOT_FOUND','订单不存在',404);
 const selected=revisionId??row.current_revision_id;
 const revision=await sql.query('SELECT * FROM order_revisions WHERE id=$1 AND order_id=$2',[selected,id]);const r=revision.rows[0];if(!r)fail('NOT_FOUND','订单版本不存在',404);
 const lines=await loadLines(sql,selected);
 const returnTotal=await sql.query<{amount:string}>(`SELECT COALESCE(sum(l.return_amount),0)::numeric(20,2)::text AS amount FROM sales_returns r JOIN return_lines l ON l.return_id=r.id WHERE r.order_id=$1 AND r.status='confirmed'`,[id]);
 return parseSchema('OrderAdmin',{id:row.id,orderNo:row.order_no,status:row.status,version:Number(row.version),revisionId:selected,revisionNo:Number(r.revision_no),customerId:r.customer_id,deliverySnapshot:r.address_snapshot,confirmedAt:row.confirmed_at?timestamp(row.confirmed_at):null,deliveryStatus:row.delivery_status,deliveredAt:row.delivered_at?timestamp(row.delivered_at):null,subtotalAmount:r.subtotal_amount,discountAmount:r.discount_amount,roundOffAmount:r.round_off_amount,totalAmount:r.total_amount,returnAmount:returnTotal.rows[0]!.amount,remark:r.remark,lines:lines.map(line=>line.dto),currentRevisionPrintStatus:await currentRevisionPrintStatus(sql,id,row.current_revision_id),createdAt:timestamp(row.created_at),updatedAt:timestamp(row.updated_at),costAmount:r.cost_amount,grossProfit:r.gross_profit,accountChanges:[],isCurrentRevision:selected===row.current_revision_id});
}
export async function orderHeader(sql:Sql,revisionId:string):Promise<Header>{
 const r=(await sql.query('SELECT * FROM order_revisions WHERE id=$1',[revisionId])).rows[0];if(!r)fail('NOT_FOUND','订单版本不存在',404);
 return{customerId:r.customer_id,...(r.address_id?{addressId:r.address_id}:{}),deliverySnapshot:r.address_snapshot,discountAmount:r.discount_amount,roundOffAmount:r.round_off_amount,remark:r.remark};
}
