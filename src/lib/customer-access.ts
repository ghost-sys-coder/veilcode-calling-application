import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { reviewDatabase } from "@/lib/review-db";
import { BillingError } from "@/lib/billing-config";
import { isApprovedOperator } from "@/lib/access";
import type { AccessCustomer, OperatorAccess } from "@/lib/billing-types";

export async function billingTransaction<T>(run:(client:PoolClient)=>Promise<T>):Promise<T> {
  const client=await reviewDatabase().connect();
  try {await client.query("BEGIN");const result=await run(client);await client.query("COMMIT");return result;}
  catch(error){await client.query("ROLLBACK").catch(()=>{});throw error;}
  finally{client.release();}
}
export async function getOperatorAccess(operatorId:string):Promise<OperatorAccess|null> {
  return (await reviewDatabase().query<OperatorAccess>(`SELECT status,revision,review_note AS "reviewNote",updated_at::text AS "updatedAt"
    FROM veilcall_operator_access WHERE operator_id=$1`,[operatorId])).rows[0]??null;
}
export async function requestOperatorAccess(operatorId:string):Promise<void> {
  await billingTransaction(async client=>{
    const profile=await client.query("SELECT 1 FROM veilcall_business_profiles WHERE operator_id=$1",[operatorId]);
    if(!profile.rowCount)throw new BillingError("Save your business details before requesting access.");
    const result=await client.query(`INSERT INTO veilcall_operator_access(operator_id,status) VALUES($1,'pending')
      ON CONFLICT(operator_id) DO UPDATE SET status='pending',revision=veilcall_operator_access.revision+1,review_note='',updated_at=now()
      WHERE veilcall_operator_access.status='rejected' RETURNING operator_id`,[operatorId]);
    if(!result.rowCount)throw new BillingError("Your access request is already submitted. Contact the owner if your account is suspended.",409);
    await client.query(`INSERT INTO veilcall_access_audit(id,operator_id,actor_id,action,note) VALUES($1,$2,$2,'request','')`,[randomUUID(),operatorId]);
  });
}
export async function listAccessCustomers():Promise<AccessCustomer[]> {
  return (await reviewDatabase().query<AccessCustomer>(`SELECT a.operator_id AS "operatorId",p.business_name AS "businessName",
    p.contact_name AS "contactName",p.business_country AS "businessCountry",p.website,p.purpose,
    jsonb_build_object('status',a.status,'revision',a.revision,'reviewNote',a.review_note,'updatedAt',a.updated_at) AS access
    FROM veilcall_operator_access a JOIN veilcall_business_profiles p USING(operator_id)
    ORDER BY CASE WHEN a.status='pending' THEN 0 ELSE 1 END,a.updated_at DESC LIMIT 100`)).rows;
}
export async function reviewOperatorAccess(operatorId:string,actorId:string,status:string,revision:number,note:string) {
  if(isApprovedOperator(operatorId))throw new BillingError("Configured pilot access is protected. This queue manages customer accounts.",409);
  await billingTransaction(async client=>{
    const previous=await client.query("SELECT status FROM veilcall_operator_access WHERE operator_id=$1 FOR UPDATE",[operatorId]);
    const before=previous.rows[0]?.status;
    const transitions:Record<string,string[]>={pending:["approved","rejected"],approved:["suspended"],rejected:["approved"],suspended:["approved","rejected"]};
    if(!before || !transitions[before]?.includes(status))throw new BillingError("This access change is not available. Refresh the customer list.",409);
    const result=await client.query(`UPDATE veilcall_operator_access SET status=$2,revision=revision+1,review_note=$4,updated_at=now()
      WHERE operator_id=$1 AND revision=$3 RETURNING operator_id`,[operatorId,status,revision,note]);
    if(!result.rowCount)throw new BillingError("This account has changed. Refresh before reviewing it.",409);
    await client.query(`INSERT INTO veilcall_access_audit(id,operator_id,actor_id,action,note) VALUES($1,$2,$3,$4,$5)`,[randomUUID(),operatorId,actorId,status,note]);
  });
}
