import 'server-only';
import {randomUUID} from 'node:crypto';
import {reviewDatabase} from '@/lib/review-db';
import {billingTransaction} from '@/lib/customer-access';
import {BillingError} from '@/lib/billing-config';
import {twilioSettlementStatus} from '@/lib/twilio-settlement-store';
import type {SettlementReport,SettlementReviewItem} from '@/lib/settlement-review-types';

export async function settlementReport():Promise<SettlementReport> {
  const [counts,items,worker]=await Promise.all([
    twilioSettlementStatus(),
    reviewDatabase().query<SettlementReviewItem>(`SELECT j.reservation_id AS id,j.revision,r.route,
      '•••• '||right(r.to_number,4) AS destination,r.held_micro AS "heldMicro",j.reason,j.attempts,j.created_at AS "createdAt"
      FROM veilcall_twilio_settlements j JOIN veilcall_call_reservations r ON r.id=j.reservation_id
      WHERE j.state='review' ORDER BY j.created_at,j.reservation_id LIMIT 10`),
    reviewDatabase().query<{lastAutomaticCheck:string|null;lastAutomaticFailure:string|null}>(`SELECT last_success_at AS "lastAutomaticCheck",last_failure_at AS "lastAutomaticFailure"
      FROM veilcall_settlement_worker WHERE name='twilio'`),
  ]);
  return {...counts,items:items.rows,...(worker.rows[0]??{lastAutomaticCheck:null,lastAutomaticFailure:null})};
}
export function settlementRecheckInput(value:unknown):{id:string;revision:number;note:string} {
  const body=value as Record<string,unknown>|null;
  if(!body || Array.isArray(body) || Object.keys(body).some(key=>!['action','id','revision','note'].includes(key)) || body.action!=='recheck' ||
    typeof body.id!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id) ||
    typeof body.revision!=='number' || !Number.isSafeInteger(body.revision) || body.revision<1 || typeof body.note!=='string' ||
    body.note.trim().length<10 || body.note.trim().length>500)throw new BillingError('Choose a review item and add a reason of 10–500 characters.');
  return {id:body.id,revision:body.revision,note:body.note.trim()};
}
export async function recheckSettlement(actorId:string,input:{id:string;revision:number;note:string}):Promise<string> {
  return billingTransaction(async client=>{
    const {rows:[job]}=await client.query<{parentSid:string;reason:string|null;attempts:number}>(`SELECT j.parent_sid AS "parentSid",j.reason,j.attempts
      FROM veilcall_twilio_settlements j JOIN veilcall_call_reservations r ON r.id=j.reservation_id
      JOIN veilcall_billing_accounts a ON a.id=r.account_id
      WHERE j.reservation_id=$1 AND j.revision=$2 AND j.state='review' AND a.mode='live'
        AND r.call_sid=j.parent_sid AND r.status IN ('active','settled') FOR UPDATE OF j`,[input.id,input.revision]);
    if(!job)throw new BillingError('This review item has changed or its call binding needs investigation. Refresh before trying again.',409);
    await client.query(`UPDATE veilcall_twilio_settlements SET state='pending',reason=NULL,attempts=0,next_attempt_at=now(),
      lease_token=NULL,lease_until=NULL,revision=revision+1,updated_at=now() WHERE reservation_id=$1`,[input.id]);
    await client.query(`INSERT INTO veilcall_settlement_audit(id,reservation_id,actor_id,action,note,previous_reason,previous_attempts)
      VALUES($1,$2,$3,'recheck',$4,$5,$6)`,[randomUUID(),input.id,actorId,input.note,job.reason,job.attempts]);
    return job.parentSid;
  });
}
export async function recordSettlementWorker(success:boolean):Promise<void> {
  await reviewDatabase().query(`INSERT INTO veilcall_settlement_worker(name,last_success_at,last_failure_at)
    VALUES('twilio',CASE WHEN $1 THEN now() END,CASE WHEN NOT $1 THEN now() END)
    ON CONFLICT(name) DO UPDATE SET last_success_at=CASE WHEN $1 THEN now() ELSE veilcall_settlement_worker.last_success_at END,
      last_failure_at=CASE WHEN NOT $1 THEN now() ELSE veilcall_settlement_worker.last_failure_at END`,[success]);
}
