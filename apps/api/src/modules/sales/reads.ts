import type {SchemaValue} from '@huoyoupu/contracts';
import {projectOrderResponse} from '@huoyoupu/contracts';
import {roundHalfUp} from '@huoyoupu/money';
import type {HistoricalPriceLookup} from '../catalog/service.js';
import {cents,fail,getOrder,timestamp,type Sql} from './model.js';

function cursor(value:string|undefined,scope:string):string|undefined{
 if(!value)return;try{const parsed:unknown=JSON.parse(Buffer.from(value,'base64url').toString());if(!Array.isArray(parsed)||parsed.length!==2||parsed[0]!==scope||typeof parsed[1]!=='string'||!/^[0-9a-f-]{36}$/i.test(parsed[1]))throw new Error();return parsed[1];}catch{return fail('INVALID_REQUEST','分页游标无效或条件已变化',400);}
}
const encode=(scope:string,id:string)=>Buffer.from(JSON.stringify([scope,id])).toString('base64url');
export async function listOrders(sql:Sql,role:'admin'|'employee',options:{cursor?:string;limit?:number;customerId?:string;status?:string;from?:string;to?:string;q?:string}={}):Promise<SchemaValue<'OrderPageAdmin'>|SchemaValue<'OrderPagePublic'>>{
 const limit=options.limit??50;const scope=JSON.stringify(['orders',options.customerId,options.status,options.from,options.to,options.q]);const after=cursor(options.cursor,scope);
 const rows=await sql.query<{id:string}>(`SELECT o.id FROM sales_orders o JOIN order_revisions r ON r.id=o.current_revision_id WHERE ($1::uuid IS NULL OR o.id>$1) AND ($2::uuid IS NULL OR o.customer_id=$2) AND ($3::text IS NULL OR o.status=$3) AND ($4::timestamptz IS NULL OR o.confirmed_at>=$4) AND ($5::timestamptz IS NULL OR o.confirmed_at<$5) AND ($6::text IS NULL OR position(lower($6) IN lower(o.order_no || ' ' || (r.address_snapshot->>'customerName')))>0) ORDER BY o.id LIMIT $7`,[after??null,options.customerId??null,options.status??null,options.from??null,options.to??null,options.q??null,limit+1]);
 const items=[];for(const row of rows.rows.slice(0,limit)){
  const order=await getOrder(sql,row.id);items.push({id:order.id,orderNo:order.orderNo,status:order.status,customerId:order.customerId,customerName:order.deliverySnapshot.customerName,version:order.version,revisionId:order.revisionId,revisionNo:order.revisionNo,totalAmount:order.totalAmount,confirmedAt:order.confirmedAt,deliveryStatus:order.deliveryStatus,currentRevisionPrintStatus:order.currentRevisionPrintStatus,updatedAt:order.updatedAt,costAmount:order.costAmount,grossProfit:order.grossProfit});
 }
 return projectOrderResponse(role,'page',{items,nextCursor:rows.rows.length>limit?encode(scope,items.at(-1)!.id):null,asOf:new Date().toISOString()});
}
export async function listRevisions(sql:Sql,id:string,options:{cursor?:string;limit?:number}={}):Promise<SchemaValue<'OrderRevisionPage'>>{
 const order=await getOrder(sql,id);const limit=options.limit??50;const scope=`revisions:${id}`;const after=cursor(options.cursor,scope);
 const result=await sql.query('SELECT * FROM order_revisions WHERE order_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3',[id,after??null,limit+1]);
 const items=result.rows.slice(0,limit).map(row=>({revisionId:row.id as string,revisionNo:Number(row.revision_no),createdAt:timestamp(row.created_at),changeReason:row.change_reason as string,createdBy:row.created_by as string,isCurrent:row.id===order.revisionId}));
 return{items,nextCursor:result.rows.length>limit?encode(scope,items.at(-1)!.revisionId):null,asOf:new Date().toISOString()};
}
export const historicalPrice:HistoricalPriceLookup=async(sql,customerId,productId,unitId)=>{
 const result=await sql.query(`SELECT o.id AS order_id,o.confirmed_at,r.id AS revision_id,l.* FROM sales_orders o JOIN order_revisions r ON r.id=o.current_revision_id JOIN revision_lines l ON l.revision_id=r.id WHERE o.customer_id=$1 AND o.status='confirmed' AND l.product_id=$2 AND l.unit_id=$3 AND l.kind<>'return_history' AND l.quantity_base>l.returned_quantity_base ORDER BY o.confirmed_at DESC,o.id DESC,l.position DESC,l.id DESC LIMIT 1`,[customerId,productId,unitId]);
 const row=result.rows[0];if(!row)return;
 const net=cents(row.net_amount)-cents(row.returned_net_amount);const q=BigInt(row.quantity_base)-BigInt(row.returned_quantity_base);
 const micros=roundHalfUp(net*BigInt(row.multiplier_snapshot)*10_000n,q);
 return{unitPrice:`${micros/1_000_000n}.${(micros%1_000_000n).toString().padStart(6,'0')}`,sourceOrderId:row.order_id,sourceRevisionId:row.revision_id,sourceLineId:row.line_id,sourceConfirmedAt:timestamp(row.confirmed_at),sourceNetAmount:(net/100n).toString()+'.'+(net%100n).toString().padStart(2,'0')};
};
