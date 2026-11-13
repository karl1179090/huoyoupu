import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {SchemaValue} from '@huoyoupu/contracts';
import {parseUnitPrice,roundHalfUp,toBaseQuantity} from '@huoyoupu/money';
import type {OperationContext} from '../../lib/security.js';
import {getCatalog} from '../catalog/service.js';
import type {CommercialChange,FinancePort} from '../finance/port.js';
import {lockStockBalances,type IssueLine} from '../inventory/stock.js';
import {sources,releaseLine} from './allocations.js';
import {issueLines} from './confirm.js';
import {calculate,cents,fail,getOrder,headerFor,loadLines,lockOrder,money,orderHeader,persistRevision,prepareLine,requireState,sum,type Header,type Order,type OrderRow,type PreparedLine,type StoredLineInput} from './model.js';

interface Target {original:PreparedLine;editable:PreparedLine|null;returned:number}
export interface RevisionPlan {header:Header;lines:PreparedLine[];releases:{line:PreparedLine;quantity:number;selections?:{saleAllocationId:string;quantityBase:number}[]}[];issues:IssueLine[]}
function displayedPrice(price:string,multiplier:number):string {const micros=roundHalfUp(parseUnitPrice(price),BigInt(multiplier));return`${micros/1_000_000n}.${(micros%1_000_000n).toString().padStart(6,'0')}`;}
async function splitReturned(client:PoolClient,line:PreparedLine):Promise<{history:PreparedLine;editable:PreparedLine|null}>{
 const product=await getCatalog(client,'Product',line.dto.productId);const base=product.units.find(unit=>unit.id===product.baseUnitId)!;const returned=line.dto.returnedQuantityBase;
 const grouped=await client.query<{sale_allocation_id:string;q:string;cost:string}>(`SELECT a.sale_allocation_id,sum(a.quantity_base)::text AS q,sum(a.cost_credit_amount)::numeric(20,2)::text AS cost FROM return_allocations a JOIN return_lines l ON l.id=a.return_line_id JOIN sales_returns r ON r.id=l.return_id WHERE l.source_revision_line_id=$1 AND r.status='confirmed' GROUP BY a.sale_allocation_id`,[line.rowId]);
 const allocations=new Map(grouped.rows.map(row=>[row.sale_allocation_id,row]));
 const history=structuredClone(line);history.dto={...history.dto,kind:'return_history',readOnly:true,unitId:base.id,unitName:base.name,multiplierBase:1,quantity:null,quantityBase:returned,unitPrice:displayedPrice(line.input.pricingBasis?.price??line.dto.unitPrice,line.input.pricingBasis?.multiplier??line.dto.multiplierBase),subtotalAmount:line.returnedSubtotal,discountAllocatedAmount:line.returnedDiscount,netAmount:line.returnedNet,costAmount:line.returnedCost,grossProfit:money(cents(line.returnedNet)-cents(line.returnedCost)),returnedQuantityBase:returned,allocations:line.dto.allocations.flatMap(link=>{const match=allocations.get(link.id);return match?[{...link,quantityBase:Number(match.q),costAmount:match.cost}]:[];})};
 if(returned===line.dto.quantityBase)return{history,editable:null};
 const editable=structuredClone(line);const remaining=line.dto.quantityBase-returned;const basis=line.input.pricingBasis??{price:line.dto.unitPrice,multiplier:line.dto.multiplierBase};
 editable.dto={...editable.dto,id:randomUUID(),kind:'derived',readOnly:false,unitId:base.id,unitName:base.name,multiplierBase:1,quantity:null,quantityBase:remaining,unitPrice:displayedPrice(basis.price,basis.multiplier),subtotalAmount:money(cents(line.dto.subtotalAmount)-cents(line.returnedSubtotal)),discountAllocatedAmount:money(cents(line.dto.discountAllocatedAmount)-cents(line.returnedDiscount)),netAmount:money(cents(line.dto.netAmount)-cents(line.returnedNet)),costAmount:money(cents(line.dto.costAmount)-cents(line.returnedCost)),grossProfit:money(cents(line.dto.netAmount)-cents(line.returnedNet)-cents(line.dto.costAmount)+cents(line.returnedCost)),returnedQuantityBase:0,allocations:line.dto.allocations.flatMap(link=>{const match=allocations.get(link.id);const q=link.quantityBase-Number(match?.q??0);return q?[{...link,quantityBase:q,costAmount:money(cents(link.costAmount)-cents(match?.cost??'0.00'))}]:[];})};
 editable.input={...editable.input,clientLineId:`derived:${editable.dto.id}`,unitId:base.id,quantity:remaining,unitPrice:editable.dto.unitPrice,pricingBasis:basis};editable.returnedNet='0.00';editable.returnedSubtotal='0.00';editable.returnedDiscount='0.00';editable.returnedCost='0.00';editable.quoteSourceLineId=line.dto.id;delete editable.rowId;
 return{history,editable};
}

/** Plans only; original source links survive normalization, including a derived new line id. */
export async function planRevision(client:PoolClient,order:OrderRow,input:SchemaValue<'OrderReviseInput'>):Promise<RevisionPlan>{
 requireState(order,'confirmed');const priorHeader=await orderHeader(client,order.current_revision_id);const prior=await loadLines(client,order.current_revision_id);
 const headerSelection=input.customerId!==undefined||input.addressId!==undefined||input.deliverySnapshot!==undefined;
 const header=headerSelection?await headerFor(client,{customerId:input.customerId??priorHeader.customerId,...(input.addressId?{addressId:input.addressId}:{}),...(input.deliverySnapshot?{deliverySnapshot:input.deliverySnapshot}:{}),discountAmount:input.discountAmount??priorHeader.discountAmount,roundOffAmount:input.roundOffAmount??priorHeader.roundOffAmount,remark:input.remark??priorHeader.remark}):{...priorHeader,discountAmount:input.discountAmount??priorHeader.discountAmount,roundOffAmount:input.roundOffAmount??priorHeader.roundOffAmount,remark:input.remark??priorHeader.remark};
 const lines:PreparedLine[]=[];const targets=new Map<string,Target>();
 for(const original of prior){
  if(original.dto.readOnly){lines.push(original);targets.set(original.dto.id,{original,editable:null,returned:original.dto.quantityBase});continue;}
  if(original.dto.returnedQuantityBase){const split=await splitReturned(client,original);lines.push(split.history);if(split.editable)lines.push(split.editable);targets.set(original.dto.id,{original,editable:split.editable,returned:original.dto.returnedQuantityBase});}
  else{lines.push(original);targets.set(original.dto.id,{original,editable:original,returned:0});}
 }
 const releases:RevisionPlan['releases']=[];const issues:IssueLine[]=[];const touched=new Set<string>();const usedSelections=new Set<string>();const clientIds=new Set<string>();
 for(const command of input.lineChanges){
  if(command.op==='add'){
   if(clientIds.has(command.line.clientLineId))fail('INVALID_REQUEST','新增明细客户端标识重复',400);clientIds.add(command.line.clientLineId);
   const added=await prepareLine(client,command.line);lines.push(added);issues.push(issueDemand(added,added.dto.quantityBase));continue;
  }
  if(touched.has(command.lineId))fail('INVALID_REQUEST','同一次修改不能重复操作一行',400);touched.add(command.lineId);
  const target=targets.get(command.lineId);if(!target)fail('NOT_FOUND','明细不属于当前订单版本',404);
  if(!target.editable||target.original.dto.readOnly)fail('RELATED_RECORD_CONFLICT','已退历史段只读，不能修改或删除');
  const old=target.editable;let next:PreparedLine|null;
  if(command.op==='remove'){
   if(target.returned)fail('RELATED_RECORD_CONFLICT','不能删除已有退货来源的原行；请修改剩余数量');next=null;
  }else{
   const productChanged=command.productId!==undefined&&command.productId!==old.dto.productId;
   if(target.returned&&!productChanged){
    const selectedUnit=command.unitId??target.original.dto.unitId;const product=await getCatalog(client,'Product',old.dto.productId);const unit=product.units.find(unit=>unit.id===selectedUnit);if(!unit)fail('NOT_FOUND','单位不属于该商品',404);
    const base=product.units.find(unit=>unit.id===product.baseUnitId)!;
    const desired=command.quantity===undefined?old.dto.quantityBase:Number(toBaseQuantity(command.quantity,unit.multiplierBase))-target.returned;
    if(desired<0)fail('RETURN_EXCEEDS_SOURCE','修改后的总数量不能低于已退数量',422);
    if(!desired)next=null;
    else{
     const basis=command.unitPrice!==undefined?{price:command.unitPrice,multiplier:unit.multiplierBase}:old.input.pricingBasis??{price:target.original.dto.unitPrice,multiplier:target.original.dto.multiplierBase};
     const data:StoredLineInput={...old.input,...(command.warehouseId?{warehouseId:command.warehouseId}:{}),unitId:base.id,quantity:desired,unitPrice:displayedPrice(basis.price,basis.multiplier),pricingBasis:basis,...(command.allocationMode?{allocationMode:command.allocationMode}:{}),...(command.batchSelections?{batchSelections:command.batchSelections}:{}),...(command.remark===undefined?{}:{remark:command.remark})};
     next=await prepareLine(client,data,old.dto.id,true);next.dto.kind='derived';next.dto.quantity=null;
     if(desired===old.dto.quantityBase&&command.unitPrice===undefined&&command.unitId===undefined){next.dto.subtotalAmount=old.dto.subtotalAmount;next.dto.netAmount=old.dto.netAmount;next.dto.discountAllocatedAmount=old.dto.discountAllocatedAmount;}
    }
   }else{
    const data:StoredLineInput={...old.input,...Object.fromEntries(Object.entries(command).filter(([key])=>!['op','lineId'].includes(key)))};
    if(command.unitPrice!==undefined||command.unitId!==undefined||productChanged)delete data.pricingBasis;
    next=await prepareLine(client,data,old.dto.id,true);
    if(old.dto.kind==='derived'){next.dto.kind='derived';next.dto.quantity=null;}
    if(next.dto.quantityBase===old.dto.quantityBase&&command.unitPrice===undefined&&command.unitId===undefined&&!productChanged){next.dto.subtotalAmount=old.dto.subtotalAmount;next.dto.netAmount=old.dto.netAmount;next.dto.discountAllocatedAmount=old.dto.discountAllocatedAmount;}
   }
  }
  const reallocate=next!==null&&(next.dto.productId!==old.dto.productId||next.dto.warehouseId!==old.dto.warehouseId||command.op==='set'&&(command.batchSelections!==undefined||command.allocationMode!==undefined&&command.allocationMode!==old.input.allocationMode));
  const releaseQuantity=next===null||reallocate?old.dto.quantityBase:Math.max(0,old.dto.quantityBase-next.dto.quantityBase);
  const releaseSelections=input.releaseSelections?.filter(selection=>old.dto.allocations.some(link=>link.id===selection.saleAllocationId));
  if(releaseSelections?.length)for(const selection of releaseSelections)usedSelections.add(selection.saleAllocationId);
  if(releaseQuantity)releases.push({line:old,quantity:releaseQuantity,...(releaseSelections?.length?{selections:releaseSelections}:{})});
  if(next){
   // prepareLine rebuilds the estimate; keep the requested source, not a temporary derived id.
   next.quoteSourceLineId=target.original.dto.id;
   next.dto.allocations=reallocate?[]:old.dto.allocations;next.dto.costAmount=reallocate?'0.00':old.dto.costAmount;
   const issueQuantity=reallocate?next.dto.quantityBase:Math.max(0,next.dto.quantityBase-old.dto.quantityBase);
   if(issueQuantity)issues.push(issueDemand(next,issueQuantity));
   // Share source-link mutations performed during release, while retaining normalized line data.
   for(const release of releases)if(release.line===old&&!reallocate)release.line=next;
   lines.splice(lines.indexOf(old),1,next);
  }else lines.splice(lines.indexOf(old),1);
 }
 if(input.releaseSelections?.some(selection=>!usedSelections.has(selection.saleAllocationId)))fail('RELATED_RECORD_CONFLICT','存在未用于本次减量的释放来源选择');
 if(!lines.length)fail('ORDER_STATE_CONFLICT','订单不能修改为空单，请使用作废流程');
 for(const demand of issues){const product=await getCatalog(client,'Product',demand.productId);const warehouse=await getCatalog(client,'Warehouse',demand.warehouseId);const line=lines.find(l=>l.dto.id===demand.lineId)!;const unit=product.units.find(u=>u.id===line.dto.unitId);if(!product.active||!warehouse.active||!unit?.active)fail('RELATED_RECORD_CONFLICT','停用资料不能用于新增出库');}
 calculate(lines,header.discountAmount,header.roundOffAmount);
 return{header,lines,releases,issues};
}
function issueDemand(line:PreparedLine,quantityBase:number):IssueLine{return{lineId:line.dto.id,productId:line.dto.productId,warehouseId:line.dto.warehouseId,quantityBase,allocationMode:line.input.allocationMode,...(line.input.batchSelections?{batchSelections:line.input.batchSelections}:{})};}
export async function commercialChanges(client:PoolClient,order:OrderRow,prior:Order,nextTotal:string,nextCustomer:string,revisionNo:number,finance:FinancePort):Promise<CommercialChange[]>{
 const changes:CommercialChange[]=[];
 if(order.customer_id!==nextCustomer){
  const existing=await finance.listCommercial(client,order.id);const reversed=new Set(existing.flatMap(entry=>entry.reversesId?[entry.reversesId]:[]));
  for(const entry of existing.filter(entry=>entry.customerId===order.customer_id&&!entry.reversesId&&!reversed.has(entry.id))){
   changes.push({customerId:entry.customerId,kind:'reversal',sourceId:entry.sourceId,sourceVersion:entry.sourceVersion,amountSigned:-entry.amountSigned,effectiveAt:entry.effectiveAt,reversesId:entry.id});
   changes.push({customerId:nextCustomer,kind:'reclassification',sourceId:entry.sourceId,sourceVersion:entry.sourceVersion,amountSigned:entry.amountSigned,effectiveAt:entry.effectiveAt,reclassifiesId:entry.id});
  }
 }
 const delta=cents(nextTotal)-cents(prior.totalAmount);
 if(delta)changes.push({customerId:nextCustomer,kind:'sale',sourceId:order.id,sourceVersion:revisionNo,amountSigned:delta,effectiveAt:order.confirmed_at!});
 return changes;
}
export async function reviseOrder(context:OperationContext,id:string,input:SchemaValue<'OrderReviseInput'>,finance:FinancePort):Promise<Order>{
 const order=await lockOrder(context.client,id,input.expectedVersion);const before=await getOrder(context.client,id);const plan=await planRevision(context.client,order,input);
 await finance.lockAccounts(context.client,[order.customer_id,plan.header.customerId]);
 await lockStockBalances(context.client,[...before.lines,...plan.lines.map(line=>line.dto)]);
 const all=await sources(context.client,id,true);const revisionId=randomUUID();
 for(const release of plan.releases)await releaseLine(context,revisionId,release.line,all,release.quantity,release.selections);
 await issueLines(context,id,revisionId,plan.lines,plan.issues);
 const totals=calculate(plan.lines,plan.header.discountAmount,plan.header.roundOffAmount);
 const changes=await commercialChanges(context.client,order,before,totals.totalAmount,plan.header.customerId,before.revisionNo+1,finance);
 await persistRevision(context,id,before.revisionNo+1,plan.header,plan.lines,input.reason,revisionId);
 await context.client.query('UPDATE sales_orders SET customer_id=$2,current_revision_id=$3,version=version+1,updated_at=clock_timestamp() WHERE id=$1',[id,plan.header.customerId,revisionId]);
 const accountChanges=await finance.applyCommercial(context.client,{operationId:context.operationId,actorId:context.actor.id,orderId:id,changes});
 return{...await getOrder(context.client,id),accountChanges};
}
