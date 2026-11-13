import type {PoolClient} from 'pg';
import {allocateFromSource,quantity} from '@huoyoupu/money';
import type {OperationContext} from '../../lib/security.js';
import {restoreInventory,selectReleaseSources,type RestoreSelection} from '../inventory/stock.js';
import {cents,fail,money,type PreparedLine} from './model.js';

export interface SaleSource {id:string;order_id:string;line_id:string;batch_id:string;issue_sequence:string;issued_quantity_base:string;issued_cost_amount:string;released_quantity_base:string;released_cost_amount:string;returned_quantity_base:string;return_credit_cost_amount:string;restocked_quantity_base:string;restocked_cost_amount:string;void_restored_quantity_base:string;void_restored_cost_amount:string}
export async function sources(client:PoolClient,orderId:string,lock=false):Promise<SaleSource[]>{return(await client.query<SaleSource>(`SELECT * FROM sale_allocations WHERE order_id=$1 ORDER BY id ${lock?'FOR UPDATE':''}`,[orderId])).rows;}
export function claimCost(source:SaleSource,requested:bigint):bigint{
 return allocateFromSource({quantity:BigInt(source.issued_quantity_base),amount:cents(source.issued_cost_amount),allocatedQuantity:BigInt(source.released_quantity_base)+BigInt(source.returned_quantity_base),allocatedAmount:cents(source.released_cost_amount)+cents(source.return_credit_cost_amount)},requested).amount;
}
export function selectForLine(line:PreparedLine,all:SaleSource[],requested:number,selections?:{saleAllocationId:string;quantityBase:number}[]):RestoreSelection[]{
 const eligible=line.dto.allocations.map(link=>{const source=all.find(source=>source.id===link.id);if(!source)fail('RELATED_RECORD_CONFLICT','消耗来源不存在');return{id:source.id,issueSequence:Number(source.issue_sequence),availableQuantityBase:Math.min(link.quantityBase,Number(BigInt(source.issued_quantity_base)-BigInt(source.released_quantity_base)-BigInt(source.returned_quantity_base)))};});
 if(!selections?.length)return selectReleaseSources(eligible,requested);
 if(new Set(selections.map(selection=>selection.saleAllocationId)).size!==selections.length||selections.reduce((sum,selection)=>sum+BigInt(selection.quantityBase),0n)!==BigInt(requested))fail('RELATED_RECORD_CONFLICT','原来源选择须完整覆盖数量且不能重复');
 return selections.map(selection=>{const source=eligible.find(source=>source.id===selection.saleAllocationId);if(!source||BigInt(source.availableQuantityBase)<quantity(selection.quantityBase))fail('RETURN_EXCEEDS_SOURCE','原消耗来源不足或不属于该行',422);return{allocationId:source.id,quantityBase:selection.quantityBase};});
}
export async function releaseLine(context:OperationContext,revisionId:string,line:PreparedLine,all:SaleSource[],requested:number,selections?:{saleAllocationId:string;quantityBase:number}[]):Promise<void>{
 const chosen=selectForLine(line,all,requested,selections);
 for(const choice of chosen){
  const source=all.find(source=>source.id===choice.allocationId)!;const cost=claimCost(source,BigInt(choice.quantityBase));choice.costAmount=money(cost);
  await context.client.query('INSERT INTO sale_release_lines(id,operation_id,revision_id,sale_allocation_id,quantity_base,cost_amount) VALUES(gen_random_uuid(),$1,$2,$3,$4,$5)',[context.operationId,revisionId,source.id,choice.quantityBase,choice.costAmount]);
  await context.client.query('UPDATE sale_allocations SET released_quantity_base=released_quantity_base+$2,released_cost_amount=released_cost_amount+$3,version=version+1 WHERE id=$1',[source.id,choice.quantityBase,choice.costAmount]);
  source.released_quantity_base=(BigInt(source.released_quantity_base)+BigInt(choice.quantityBase)).toString();source.released_cost_amount=money(cents(source.released_cost_amount)+cost);
  const link=line.dto.allocations.find(link=>link.id===source.id)!;link.quantityBase-=choice.quantityBase;link.costAmount=money(cents(link.costAmount)-cost);
 }
 await restoreInventory(context,{sourceKind:'order_revision_release',sourceId:revisionId,selections:chosen});
 line.dto.allocations=line.dto.allocations.filter(link=>link.quantityBase>0);
}
