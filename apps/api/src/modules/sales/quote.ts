import type {PoolClient} from 'pg';
import type {SchemaValue} from '@huoyoupu/contracts';
import {allocateFromSource, quantity} from '@huoyoupu/money';
import type {FinancePort, CommercialChange} from '../finance/port.js';
import {calculate,cents,fail,getOrder,headerFor,money,prepareLines,sum,type Header,type PreparedLine,type OrderRow} from './model.js';
import {claimCost,selectForLine,sources} from './allocations.js';
import {commercialChanges,planRevision} from './revisions.js';

interface EstimateBatch {id:string;product_id:string;warehouse_id:string;remaining_quantity_base:string;remaining_cost_amount:string;input_unit_cost:string;multiplier_snapshot:string}
/** A consistent read only estimate; quantities exist solely in this local calculation. */
export async function estimateInventory(client:PoolClient,lines:PreparedLine[],restored:Map<string,{quantity:bigint;cost:bigint}>=new Map()):Promise<void>{
 const batches=(await client.query<EstimateBatch>('SELECT * FROM inventory_batches ORDER BY received_at,recorded_at,id')).rows;
 for(const batch of batches){const added=restored.get(batch.id);if(added){batch.remaining_quantity_base=(BigInt(batch.remaining_quantity_base)+added.quantity).toString();batch.remaining_cost_amount=money(cents(batch.remaining_cost_amount)+added.cost);}}
 for(const line of lines){
  const candidates=batches.filter(batch=>batch.product_id===line.dto.productId&&batch.warehouse_id===line.dto.warehouseId);
  let remaining=quantity(line.dto.quantityBase);
  if(line.input.allocationMode==='manual'&&(line.input.batchSelections??[]).reduce((sum,selection)=>sum+BigInt(selection.quantityBase),0n)!==remaining)fail('BATCH_SELECTION_REQUIRED','手选批次必须完整覆盖需求');
  if(line.input.allocationMode==='auto'&&line.input.batchSelections?.length)fail('BATCH_SELECTION_REQUIRED','自动模式不能附带手选批次');
  const selected=line.input.allocationMode==='manual'?line.input.batchSelections??[]:candidates.map(batch=>({batchId:batch.id,quantityBase:Number(BigInt(batch.remaining_quantity_base)<remaining?BigInt(batch.remaining_quantity_base):remaining)}));
  if(new Set(selected.map(selection=>selection.batchId)).size!==selected.length)fail('RELATED_RECORD_CONFLICT','手选批次不能重复');
  line.dto.allocations=[];
  for(const selection of selected){
   if(!remaining)break;
   const batch=candidates.find(batch=>batch.id===selection.batchId);if(!batch)fail('BATCH_SELECTION_REQUIRED','所选批次不属于商品仓库或没有余量');
   const available=BigInt(batch.remaining_quantity_base);const requested=line.input.allocationMode==='auto'?(available<remaining?available:remaining):quantity(selection.quantityBase);
   if(requested>available||requested>remaining)fail('BATCH_SELECTION_REQUIRED','手选批次不足或超过所需数量');
   if(!requested)continue;
   const amount=allocateFromSource({quantity:available,amount:cents(batch.remaining_cost_amount),allocatedQuantity:0n,allocatedAmount:0n},requested).amount;
   // Estimate identifiers are deliberately not returned to the API.
   line.dto.allocations.push({id:batch.id,batchId:batch.id,warehouseId:batch.warehouse_id,quantityBase:Number(requested),costAmount:money(amount),inputUnitCost:batch.input_unit_cost,costMultiplierBase:Number(batch.multiplier_snapshot),issueSequence:line.dto.allocations.length+1});
   batch.remaining_quantity_base=(available-requested).toString();batch.remaining_cost_amount=money(cents(batch.remaining_cost_amount)-amount);remaining-=requested;
  }
  if(remaining)fail(line.input.allocationMode==='manual'?'BATCH_SELECTION_REQUIRED':'INSUFFICIENT_STOCK','所选仓库库存不足或需要补选批次');
  line.dto.costAmount=money(sum(line.dto.allocations.map(allocation=>cents(allocation.costAmount))));
 }
}
export function calculation(header:Header,lines:PreparedLine[],accountChanges:SchemaValue<'AccountChange'>[]):SchemaValue<'OrderCalculation'>{
 const totals=calculate(lines,header.discountAmount,header.roundOffAmount);
 return{...totals,accountChanges,lines:lines.map(line=>({clientLineId:line.input.clientLineId||null,sourceLineId:line.quoteSourceLineId??(line.rowId?line.dto.id:null),productId:line.dto.productId,warehouseId:line.dto.warehouseId,unitId:line.dto.unitId,quantityBase:line.dto.quantityBase,subtotalAmount:line.dto.subtotalAmount,discountAllocatedAmount:line.dto.discountAllocatedAmount,netAmount:line.dto.netAmount,costAmount:line.dto.costAmount,grossProfit:line.dto.grossProfit,readOnly:line.dto.readOnly,allocations:line.dto.allocations.map(({batchId,warehouseId,quantityBase,costAmount,inputUnitCost,costMultiplierBase})=>({batchId,warehouseId,quantityBase,costAmount,inputUnitCost,costMultiplierBase}))}))};
}
export async function quoteNewOrder(client:PoolClient,input:SchemaValue<'OrderDraftInput'>,finance:FinancePort):Promise<SchemaValue<'OrderQuote'>>{
 const header=await headerFor(client,input);if(new Set(input.lines.map(line=>line.clientLineId)).size!==input.lines.length)fail('INVALID_REQUEST','重复的客户端行标识',400);
 const lines=await prepareLines(client,input.lines);await estimateInventory(client,lines);
 const totals=calculate(lines,header.discountAmount,header.roundOffAmount);
 // No fabricated order/source identifiers are exposed or persisted by a quote.
 const change:CommercialChange={customerId:header.customerId,kind:'sale',sourceId:'00000000-0000-4000-8000-000000000000',sourceVersion:1,amountSigned:cents(totals.totalAmount),effectiveAt:new Date()};
 const accountChanges=await finance.previewCommercial(client,[change]);
 return{calculation:calculation(header,lines,accountChanges),warnings:[],stockReserved:false,asOf:new Date().toISOString()};
}
export async function quoteRevision(client:PoolClient,id:string,input:SchemaValue<'OrderReviseInput'>,finance:FinancePort):Promise<SchemaValue<'OrderQuote'>>{
 const order=(await client.query<OrderRow>('SELECT * FROM sales_orders WHERE id=$1',[id])).rows[0];if(!order)fail('NOT_FOUND','订单不存在',404);
 if(Number(order.version)!==input.expectedVersion)fail('VERSION_CONFLICT','订单已变化，请刷新');
 const prior=await getOrder(client,id);const plan=await planRevision(client,order,input);const all=await sources(client,id);const restored=new Map<string,{quantity:bigint;cost:bigint}>();
 for(const release of plan.releases){
  for(const selection of selectForLine(release.line,all,release.quantity,release.selections)){
   const source=all.find(source=>source.id===selection.allocationId)!;const q=BigInt(selection.quantityBase);const cost=claimCost(source,q);
   source.released_quantity_base=(BigInt(source.released_quantity_base)+q).toString();source.released_cost_amount=money(cents(source.released_cost_amount)+cost);
   const link=release.line.dto.allocations.find(link=>link.id===source.id)!;link.quantityBase-=selection.quantityBase;link.costAmount=money(cents(link.costAmount)-cost);
   const previous=restored.get(source.batch_id)??{quantity:0n,cost:0n};restored.set(source.batch_id,{quantity:previous.quantity+q,cost:previous.cost+cost});
  }
  release.line.dto.allocations=release.line.dto.allocations.filter(link=>link.quantityBase>0);
 }
 const demanded=plan.issues.map(demand=>{const original=plan.lines.find(line=>line.dto.id===demand.lineId)!;const estimate=structuredClone(original);estimate.dto.quantityBase=demand.quantityBase;return estimate;});
 await estimateInventory(client,demanded,restored);
 for(const estimate of demanded){const line=plan.lines.find(line=>line.dto.id===estimate.dto.id)!;line.dto.allocations.push(...estimate.dto.allocations);}
 for(const line of plan.lines)line.dto.costAmount=money(sum(line.dto.allocations.map(link=>cents(link.costAmount))));
 const totals=calculate(plan.lines,plan.header.discountAmount,plan.header.roundOffAmount);
 const changes=await commercialChanges(client,order,prior,totals.totalAmount,plan.header.customerId,prior.revisionNo+1,finance);
 return{calculation:calculation(plan.header,plan.lines,await finance.previewCommercial(client,changes)),warnings:[],stockReserved:false,asOf:new Date().toISOString()};
}
