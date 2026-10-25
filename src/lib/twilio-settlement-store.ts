import 'server-only';
import {randomUUID} from 'node:crypto';
import {reviewDatabase} from '@/lib/review-db';
import {billingTransaction} from '@/lib/customer-access';
import {BillingError} from '@/lib/billing-config';
import {getCallReservation,lockBillingAccount,reservationFields} from '@/lib/billing-store';
import {realTwilioAccount,type SettlementReason} from '@/lib/twilio-settlement-proof';
import type {CallReservation} from '@/lib/billing-types';

export interface TwilioSettlementJob {reservation:CallReservation;accountSid:string;lease:string;attempts:number}
// Called only by the future signed live-call admission path. Account locking,
// permit consumption and the recovery record commit together, before dialing.
export async function bindTwilioReservation(id:string,operatorId:string,to:string,from:string,parentSid:string,accountSid:string):Promise<CallReservation> {
  const reservation=await getCallReservation(id);
  if(!reservation || reservation.mode!=='live' || reservation.operatorId!==operatorId || reservation.to!==to || reservation.from!==from ||
    !realTwilioAccount(accountSid) || !/^CA[0-9a-f]{32}$/.test(parentSid) || !Number.isInteger(reservation.maxSeconds) ||
    reservation.maxSeconds<60 || reservation.maxSeconds>300 || !/^\+[1-9]\d{7,14}$/.test(to) || !/^\+[1-9]\d{7,14}$/.test(from))
    throw new BillingError('The live call permit does not match.',403);
  return billingTransaction(async client=>{
    const account=await lockBillingAccount(client,reservation.accountId);
    if(account.mode!=='live' || account.blocked || account.subscriptionStatus!=='active' || !account.paidUntil || new Date(account.paidUntil).getTime()<=Date.now())
      throw new BillingError('Calling access is paused.',403);
    const result=await client.query(`UPDATE veilcall_call_reservations r SET status='active',call_sid=$2
      WHERE r.id=$1 AND r.status='reserved' AND r.expires_at>now() AND r.rate_accepted_at IS NOT NULL
        AND r.rate_acceptance_version='prepaid-live-v1' AND EXISTS (
          SELECT 1 FROM veilcall_prepaid_quotes q WHERE q.id=r.quote_id AND q.account_id=r.account_id
            AND q.to_number=r.to_number AND q.from_number=r.from_number AND q.rate_micro=r.rate_micro
            AND q.fee_micro=r.fee_micro AND q.max_seconds=r.max_seconds AND q.held_micro=r.held_micro AND q.route=r.route
        ) RETURNING id`,[id,parentSid]);
    if(!result.rowCount)throw new BillingError('This live call permit is unaccepted, already used or expired.',403);
    await client.query(`INSERT INTO veilcall_twilio_settlements(reservation_id,account_sid,parent_sid,next_attempt_at)
      VALUES($1,$2,$3,now()+make_interval(secs=>$4))`,[id,accountSid,parentSid,reservation.maxSeconds+120]);
    return {...reservation,status:'active',callSid:parentSid};
  });
}
export async function wakeTwilioSettlement(accountSid:string,parentSid:string):Promise<void> {
  await reviewDatabase().query(`UPDATE veilcall_twilio_settlements SET next_attempt_at=LEAST(next_attempt_at,now()),updated_at=now()
    WHERE account_sid=$1 AND parent_sid=$2 AND state='pending' AND attempts=0`,[accountSid,parentSid]);
}
export async function claimTwilioSettlements(parentSid?:string):Promise<TwilioSettlementJob[]> {
  return billingTransaction(async client=>{
    // A database lease allows interrupted serverless work to be retried safely.
    const rows=await client.query<{id:string;accountSid:string;parentSid:string;attempts:number}>(`SELECT j.reservation_id AS id,j.account_sid AS "accountSid",
      j.parent_sid AS "parentSid",j.attempts FROM veilcall_twilio_settlements j
      WHERE j.state='pending' AND j.next_attempt_at<=now() AND (j.lease_until IS NULL OR j.lease_until<=now())
        AND ($1::text IS NULL OR j.parent_sid=$1) ORDER BY j.next_attempt_at,j.reservation_id LIMIT 3 FOR UPDATE SKIP LOCKED`,[parentSid??null]);
    const jobs:TwilioSettlementJob[]=[];
    for(const row of rows.rows){
      const lease=randomUUID();
      await client.query(`UPDATE veilcall_twilio_settlements SET lease_token=$2,lease_until=now()+interval '90 seconds',attempts=attempts+1,updated_at=now()
        WHERE reservation_id=$1`,[row.id,lease]);
      const reservation=(await client.query<CallReservation>(`SELECT ${reservationFields} FROM veilcall_call_reservations r
        JOIN veilcall_billing_accounts a ON a.id=r.account_id WHERE r.id=$1`,[row.id])).rows[0];
      // Persisted binding and reservation must agree even after an administrative edit.
      if(!reservation || reservation.mode!=='live' || reservation.callSid!==row.parentSid || !['active','settled'].includes(reservation.status)){
        await client.query(`UPDATE veilcall_twilio_settlements SET state='review',reason='provider-mismatch',lease_token=NULL,lease_until=NULL WHERE reservation_id=$1`,[row.id]);
        continue;
      }
      jobs.push({reservation,accountSid:row.accountSid,lease,attempts:row.attempts+1});
    }
    return jobs;
  });
}
export async function finishTwilioSettlement(job:TwilioSettlementJob):Promise<void> {
  await reviewDatabase().query(`UPDATE veilcall_twilio_settlements SET state='done',reason=NULL,lease_token=NULL,lease_until=NULL,updated_at=now()
    WHERE reservation_id=$1 AND lease_token=$2`,[job.reservation.id,job.lease]);
}
export async function deferTwilioSettlement(job:TwilioSettlementJob,reason:SettlementReason,review:boolean):Promise<void> {
  const exhausted=job.attempts>=12;
  await reviewDatabase().query(`UPDATE veilcall_twilio_settlements SET state=$3,reason=$4,lease_token=NULL,lease_until=NULL,
    next_attempt_at=now()+make_interval(secs=>$5),updated_at=now() WHERE reservation_id=$1 AND lease_token=$2`,
    [job.reservation.id,job.lease,review||exhausted?'review':'pending',exhausted&&!review?'attempts-exhausted':reason,Math.min(900,15*2**Math.min(job.attempts-1,6))]);
}
export async function twilioSettlementStatus() {
  const result=await reviewDatabase().query(`SELECT count(*) FILTER(WHERE state='pending')::integer AS pending,
    count(*) FILTER(WHERE state='pending' AND next_attempt_at<=now() AND (lease_until IS NULL OR lease_until<=now()))::integer AS due,
    count(*) FILTER(WHERE state='review')::integer AS review,count(*) FILTER(WHERE state='done')::integer AS done
    FROM veilcall_twilio_settlements`);
  return result.rows[0] as {pending:number;due:number;review:number;done:number};
}
