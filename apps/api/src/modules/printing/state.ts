import type {Pool,PoolClient} from 'pg';
import type {SchemaValue} from '@huoyoupu/contracts';
export type CurrentPrintStatus=SchemaValue<'OrderPublic'>['currentRevisionPrintStatus'];
/** Caller supplies the actual current revision even when reading a historical DTO. */
export async function currentRevisionPrintStatus(sql:Pick<Pool|PoolClient,'query'>,orderId:string,revisionId:string):Promise<CurrentPrintStatus>{
 const result=await sql.query<{status:'requested'|'user_confirmed'|'user_cancelled'|'client_error'}>('SELECT status FROM print_jobs WHERE order_id=$1 AND order_revision_id=$2 ORDER BY requested_at DESC,id DESC LIMIT 1',[orderId,revisionId]);
 const status=result.rows[0]?.status;
 return status===undefined||status==='user_cancelled'?'not_requested':status;
}
