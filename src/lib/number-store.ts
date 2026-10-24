import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { reviewDatabase } from "@/lib/review-db";
import { NumberSetupError } from "@/lib/number-errors";
import type { BusinessProfile, CallerIdentity, NumberRequest, NumberRequestInput, NumberReviewInput } from "@/lib/number-types";

const profileFields=`business_name AS "businessName",contact_name AS "contactName",business_country AS "businessCountry",website,purpose`;
const requestFields=`r.id,r.operator_id AS "operatorId",r.kind,r.label,r.phone_number AS phone,r.number_country AS "numberCountry",r.details,
  (r.ownership_confirmed_at IS NOT NULL) AS "ownershipConfirmed",r.status,r.review_note AS "reviewNote",r.revision,
  r.business_snapshot AS business,r.created_at::text AS "createdAt",r.updated_at::text AS "updatedAt"`;

async function transaction<T>(run:(client:PoolClient)=>Promise<T>):Promise<T> {
  const client=await reviewDatabase().connect();
  try {await client.query("BEGIN");const result=await run(client);await client.query("COMMIT");return result;}
  catch(error) {await client.query("ROLLBACK").catch(()=>{});throw error;}
  finally {client.release();}
}
async function audit(client:PoolClient,requestId:string,actor:string,action:string,note="") {
  await client.query(`INSERT INTO veilcall_number_audit(id,request_id,actor_id,action,note) VALUES($1,$2,$3,$4,$5)`,[randomUUID(),requestId,actor,action,note]);
}
async function assertNumberUnassigned(client:PoolClient,phone:string,operatorId:string) {
  const existing=await client.query(`SELECT 1 FROM veilcall_caller_identities WHERE phone_number=$1 AND (operator_id<>$2 OR status='active')`,[phone,operatorId]);
  if (existing.rowCount) throw new NumberSetupError("This number already has an assignment. Contact the administrator.",409);
}
export async function getBusinessProfile(operatorId:string):Promise<BusinessProfile | null> {
  return (await reviewDatabase().query<BusinessProfile>(`SELECT ${profileFields} FROM veilcall_business_profiles WHERE operator_id=$1`,[operatorId])).rows[0] ?? null;
}
export async function saveBusinessProfile(operatorId:string,input:BusinessProfile):Promise<void> {
  await reviewDatabase().query(`INSERT INTO veilcall_business_profiles(operator_id,business_name,contact_name,business_country,website,purpose)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(operator_id) DO UPDATE SET business_name=$2,contact_name=$3,business_country=$4,website=$5,purpose=$6,updated_at=now()`,
  [operatorId,input.businessName,input.contactName,input.businessCountry,input.website,input.purpose]);
}
export async function listNumberRequests(operatorId:string | null,status?:string):Promise<NumberRequest[]> {
  return (await reviewDatabase().query<NumberRequest>(`SELECT ${requestFields},
    CASE WHEN $1::text IS NOT NULL AND v.status IN ('preparing','calling') AND v.expires_at>now()
      THEN jsonb_build_object('code',v.validation_code,'expiresAt',v.expires_at) ELSE NULL END AS verification
    FROM veilcall_number_requests r LEFT JOIN LATERAL
      (SELECT validation_code,expires_at,status FROM veilcall_number_verifications WHERE request_id=r.id ORDER BY created_at DESC,id DESC LIMIT 1) v ON true
    WHERE ($1::text IS NULL OR r.operator_id=$1) AND ($2::text IS NULL OR r.status=$2)
    ORDER BY CASE WHEN $1::text IS NULL AND r.status='pending' THEN 0 ELSE 1 END,r.created_at DESC,r.id DESC LIMIT 50`,[operatorId,status || null])).rows;
}
export async function getNumberRequest(id:string,operatorId?:string):Promise<NumberRequest | null> {
  return (await reviewDatabase().query<NumberRequest>(`SELECT ${requestFields},NULL AS verification FROM veilcall_number_requests r
    WHERE r.id=$1 AND ($2::text IS NULL OR r.operator_id=$2)`,[id,operatorId ?? null])).rows[0] ?? null;
}
export async function listCallerIdentities(operatorId:string):Promise<CallerIdentity[]> {
  return (await reviewDatabase().query<CallerIdentity>(`SELECT phone_number AS number,label,source,status FROM veilcall_caller_identities
    WHERE operator_id=$1 AND account_sid=$2 ORDER BY verified_at,phone_number`,[operatorId,process.env.TWILIO_ACCOUNT_SID ?? ""])).rows;
}
export async function createNumberRequest(operatorId:string,input:NumberRequestInput):Promise<string> {
  return transaction(async client=>{
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`number-request:${operatorId}`]);
    const profile=(await client.query<BusinessProfile>(`SELECT ${profileFields} FROM veilcall_business_profiles WHERE operator_id=$1`,[operatorId])).rows[0];
    if (!profile) throw new NumberSetupError("Save your business profile before requesting a number.",409);
    const counts=(await client.query<{daily:number;open:number}>(`SELECT count(*) FILTER(WHERE created_at>now()-interval '24 hours')::int AS daily,
      count(*) FILTER(WHERE status IN ('pending','approved','verifying','failed'))::int AS open FROM veilcall_number_requests WHERE operator_id=$1`,[operatorId])).rows[0];
    if (counts.daily>=5 || counts.open>=3) throw new NumberSetupError("You have reached the number-request limit. Wait for a review before submitting another request.",429);
    if (input.phone) {
      const duplicate=await client.query(`SELECT 1 FROM veilcall_number_requests WHERE operator_id=$1 AND phone_number=$2
        AND status NOT IN ('rejected','revoked') LIMIT 1`,[operatorId,input.phone]);
      if (duplicate.rowCount) throw new NumberSetupError("This number already has a request on your account.",409);
    }
    const id=randomUUID();
    await client.query(`INSERT INTO veilcall_number_requests(id,operator_id,kind,label,phone_number,number_country,details,business_snapshot,ownership_confirmed_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,CASE WHEN $3='existing' THEN now() ELSE NULL END)`,
    [id,operatorId,input.kind,input.label,input.phone,input.numberCountry,input.details,JSON.stringify(profile)]);
    await audit(client,id,operatorId,"submitted");return id;
  });
}

export interface VerificationAttempt {
  id:string; requestId:string; operatorId:string; phone:string; accountSid:string;
  callSid:string | null; status:"preparing" | "calling" | "success" | "failed"; expiresAt:string;
}
export async function getVerificationAttempt(id:string):Promise<VerificationAttempt | null> {
  return (await reviewDatabase().query<VerificationAttempt>(`SELECT id,request_id AS "requestId",operator_id AS "operatorId",phone_number AS phone,
    account_sid AS "accountSid",call_sid AS "callSid",status,expires_at::text AS "expiresAt" FROM veilcall_number_verifications WHERE id=$1`,[id])).rows[0] ?? null;
}
export async function beginNumberVerification(id:string,operatorId:string,accountSid:string):Promise<VerificationAttempt> {
  return transaction(async client=>{
    // Serialize admission across instances; provider requests happen after commit.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('veilcall:number-verification',0))");
    const request=(await client.query<NumberRequest>(`SELECT ${requestFields} FROM veilcall_number_requests r WHERE r.id=$1 AND r.operator_id=$2 FOR UPDATE`,[id,operatorId])).rows[0];
    if (!request) throw new NumberSetupError("Number request not found.",404);
    if (request.kind!=="existing" || !["approved","failed","verifying"].includes(request.status)) throw new NumberSetupError("This number must be approved for verification first.",409);
    await assertNumberUnassigned(client,request.phone!,operatorId);
    const active=await client.query(`SELECT 1 FROM veilcall_number_verifications WHERE request_id=$1 AND status IN ('preparing','calling') AND expires_at>now() LIMIT 1`,[id]);
    if (active.rowCount) throw new NumberSetupError("A verification attempt is already in progress. Use its code or wait for it to expire.",409);
    const counts=(await client.query<{daily:number;operator:number;phone:number}>(`SELECT count(*)::int AS daily,
      count(*) FILTER(WHERE operator_id=$1)::int AS operator,count(*) FILTER(WHERE phone_number=$2)::int AS phone
      FROM veilcall_number_verifications WHERE created_at>now()-interval '24 hours'`,[operatorId,request.phone])).rows[0];
    if (counts.daily>=30 || counts.operator>=3 || counts.phone>=3) throw new NumberSetupError("The verification-call limit has been reached. Try again tomorrow or contact the administrator.",429);
    await client.query(`UPDATE veilcall_number_verifications SET validation_code=NULL,status='failed' WHERE request_id=$1 AND status IN ('preparing','calling') AND expires_at<=now()`,[id]);
    const attemptId=randomUUID();
    const attempt=(await client.query<VerificationAttempt>(`INSERT INTO veilcall_number_verifications(id,request_id,operator_id,phone_number,account_sid)
      VALUES($1,$2,$3,$4,$5) RETURNING id,request_id AS "requestId",operator_id AS "operatorId",phone_number AS phone,account_sid AS "accountSid",
      call_sid AS "callSid",status,expires_at::text AS "expiresAt"`,[attemptId,id,operatorId,request.phone,accountSid])).rows[0];
    await client.query(`UPDATE veilcall_number_requests SET status='verifying',revision=revision+1,updated_at=now() WHERE id=$1`,[id]);
    await audit(client,id,operatorId,"verification_requested");return attempt;
  });
}
export async function attachNumberVerification(id:string,callSid:string,code:string):Promise<void> {
  await reviewDatabase().query(`UPDATE veilcall_number_verifications SET call_sid=$2,validation_code=$3,status='calling'
    WHERE id=$1 AND status='preparing' AND expires_at>now()`,[id,callSid,code]);
}
export async function failNumberVerification(id:string):Promise<void> {
  const attempt=await getVerificationAttempt(id);if (!attempt) return;
  await transaction(async client=>{
    await client.query(`SELECT id FROM veilcall_number_requests WHERE id=$1 FOR UPDATE`,[attempt.requestId]);
    const changed=await client.query(`UPDATE veilcall_number_verifications SET status='failed',validation_code=NULL WHERE id=$1 AND status='preparing' RETURNING id`,[id]);
    if (changed.rowCount) await client.query(`UPDATE veilcall_number_requests SET status='failed',revision=revision+1,updated_at=now() WHERE id=$1 AND status='verifying'`,[attempt.requestId]);
  });
}
async function assignIdentity(client:PoolClient,request:NumberRequest,number:string,providerSid:string,accountSid:string,source:CallerIdentity["source"]) {
  const inserted=await client.query(`INSERT INTO veilcall_caller_identities(phone_number,operator_id,request_id,label,source,provider_sid,account_sid)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(phone_number) DO UPDATE SET request_id=EXCLUDED.request_id,label=EXCLUDED.label,
    source=EXCLUDED.source,provider_sid=EXCLUDED.provider_sid,account_sid=EXCLUDED.account_sid,status='active',verified_at=now(),updated_at=now()
    WHERE veilcall_caller_identities.operator_id=EXCLUDED.operator_id RETURNING phone_number`,[number,request.operatorId,request.id,request.label,source,providerSid,accountSid]);
  if (!inserted.rowCount) throw new NumberSetupError("This number cannot be assigned to this account.",409);
}
export async function completeNumberVerification(attempt:VerificationAttempt,callSid:string,providerSid:string | null):Promise<void> {
  await transaction(async client=>{
    const request=(await client.query<NumberRequest>(`SELECT ${requestFields} FROM veilcall_number_requests r WHERE id=$1 FOR UPDATE`,[attempt.requestId])).rows[0];
    const current=(await client.query<{id:string;callSid:string|null}>(`SELECT id,call_sid AS "callSid" FROM veilcall_number_verifications
      WHERE request_id=$1 AND status IN ('preparing','calling') AND expires_at>now() ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE`,[attempt.requestId])).rows[0];
    if (!request || request.status!=="verifying" || !current || current.id!==attempt.id || (current.callSid && current.callSid!==callSid)) return;
    if (providerSid) await assignIdentity(client,request,attempt.phone,providerSid,attempt.accountSid,"verified");
    await client.query(`UPDATE veilcall_number_verifications SET status=$2,call_sid=$3,validation_code=NULL WHERE id=$1`,[attempt.id,providerSid ? "success" : "failed",callSid]);
    await client.query(`UPDATE veilcall_number_requests SET status=$2,revision=revision+1,updated_at=now() WHERE id=$1`,[request.id,providerSid ? "verified" : "failed"]);
    await audit(client,request.id,"twilio",providerSid ? "ownership_verified" : "verification_failed");
  });
}
export async function reviewNumberRequest(id:string,actor:string,input:NumberReviewInput,provisioned?:{sid:string;accountSid:string}):Promise<void> {
  await transaction(async client=>{
    const request=(await client.query<NumberRequest>(`SELECT ${requestFields} FROM veilcall_number_requests r WHERE id=$1 FOR UPDATE`,[id])).rows[0];
    if (!request) throw new NumberSetupError("Number request not found.",404);
    if (request.revision!==input.expectedRevision) throw new NumberSetupError("This request has changed. Reload it before reviewing.",409);
    let next:string;
    if (input.action==="approve" && request.status==="pending") {
      if (request.phone) await assertNumberUnassigned(client,request.phone,request.operatorId);
      next="approved";
    }
    else if (input.action==="reject" && ["pending","approved","failed","verifying"].includes(request.status)) next="rejected";
    else if (input.action==="revoke" && ["verified","fulfilled"].includes(request.status)) {
      next="revoked";
      await client.query(`UPDATE veilcall_caller_identities SET status='revoked',updated_at=now() WHERE request_id=$1 AND operator_id=$2`,[id,request.operatorId]);
    } else if (input.action==="fulfill" && request.kind==="new" && request.status==="approved" && input.phone && provisioned) {
      next="fulfilled";await assignIdentity(client,request,input.phone,provisioned.sid,provisioned.accountSid,"provisioned");
      await client.query(`UPDATE veilcall_number_requests SET phone_number=$2 WHERE id=$1`,[id,input.phone]);
    } else throw new NumberSetupError("This action is not available for the current request.",409);
    await client.query(`UPDATE veilcall_number_requests SET status=$2,review_note=$3,revision=revision+1,updated_at=now() WHERE id=$1`,[id,next,input.note]);
    await audit(client,id,actor,input.action,input.note);
  });
}
