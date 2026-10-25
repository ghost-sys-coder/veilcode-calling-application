import 'server-only';
import {randomBytes,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {reviewDatabase} from '@/lib/review-db';
import {billingTransaction} from '@/lib/customer-access';
import {BillingError} from '@/lib/billing-config';
import {reservationFields,getBillingAccount,lockBillingAccount,expireUnusedReservations} from '@/lib/billing-store';
import {reservationAmounts} from '@/lib/billing-rates';
import {prepaidDialTwiML,testProviderAccount} from '@/lib/prepaid-rules';
import type {BillingAccount,BillingRate,CallReservation} from '@/lib/billing-types';
import type {PrepaidQuote,PrepaidSession,PrepaidScenario,TestCallProof} from '@/lib/prepaid-types';

type StoredQuote=PrepaidQuote & {accountId:string};
const quoteFields=`q.id,q.account_id AS "accountId",q.to_number AS "to",q.from_number AS "from",q.route,q.rate_micro AS "rateMicro",
  q.fee_micro AS "feeMicro",q.max_seconds AS "maxSeconds",q.held_micro AS "heldMicro",q.expires_at::text AS "expiresAt"`;
export function subscriptionReady(account:BillingAccount):boolean {
  return account.subscriptionStatus==='active' && Boolean(account.paidUntil && Date.parse(account.paidUntil)>Date.now());
}
function requireUsableAccount(account:BillingAccount):void {
  if(account.mode!=='test')throw new BillingError('Test credit cannot authorize a real call.',403);
  if(account.blocked)throw new BillingError('Billing is paused. Finish or cancel an existing test before contacting the owner.',403);
  if(!subscriptionReady(account))throw new BillingError('An active, paid test subscription is required.',402);
}
async function spendable(client:PoolClient,account:BillingAccount):Promise<number> {
  const result=await client.query(`SELECT COALESCE(SUM(charge_micro),0)::float8 AS spent FROM veilcall_call_reservations
    WHERE account_id=$1 AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AND status='settled'`,[account.id]);
  return Math.max(0,Math.min(account.balanceMicro-account.heldMicro,10_000_000-Number(result.rows[0].spent)));
}
export async function getPrepaidQuote(operatorId:string,id:string):Promise<StoredQuote|null> {
  return (await reviewDatabase().query<StoredQuote>(`SELECT ${quoteFields} FROM veilcall_prepaid_quotes q
    JOIN veilcall_billing_accounts a ON a.id=q.account_id WHERE q.id=$1 AND a.operator_id=$2 AND a.mode='test'`,[id,operatorId])).rows[0]??null;
}
export async function createPrepaidQuote(operatorId:string,to:string,from:string,rate:BillingRate):Promise<StoredQuote> {
  if(rate.mode!=='test')throw new BillingError('The quote environment does not match.',403);
  const account=await getBillingAccount(operatorId,'test');
  return billingTransaction(async client=>{
    await lockBillingAccount(client,account.id);await expireUnusedReservations(client,account.id);
    const current=await lockBillingAccount(client,account.id);
    let maxSeconds=0,heldMicro=0;
    if(subscriptionReady(current) && !current.blocked){
      try{({maxSeconds,heldMicro}=reservationAmounts(await spendable(client,current),rate));}catch(error){if(!(error instanceof BillingError) || error.status!==402)throw error;}
    }
    return (await client.query<StoredQuote>(`INSERT INTO veilcall_prepaid_quotes AS q(id,account_id,to_number,from_number,route,rate_micro,fee_micro,max_seconds,held_micro,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '45 seconds') RETURNING ${quoteFields}`,
    [randomUUID(),account.id,to,from,rate.route,rate.rateMicro,rate.feeMicro,maxSeconds,heldMicro])).rows[0];
  });
}
export async function reservePrepaidQuote(operatorId:string,id:string):Promise<string> {
  const quote=await getPrepaidQuote(operatorId,id);if(!quote)throw new BillingError('This quote is not available to your account.',404);
  return billingTransaction(async client=>{
    await lockBillingAccount(client,quote.accountId);await expireUnusedReservations(client,quote.accountId);
    const current=await lockBillingAccount(client,quote.accountId);requireUsableAccount(current);
    const existing=await client.query(`SELECT id,status,expires_at>now() AS valid FROM veilcall_call_reservations WHERE quote_id=$1`,[id]);
    if(existing.rows[0]){
      if(existing.rows[0].status==='reserved' && existing.rows[0].valid)return existing.rows[0].id;
      throw new BillingError('This quote has already been used. Preview a new rate for another test.',409);
    }
    const locked=await client.query(`SELECT expires_at>now() AS valid FROM veilcall_prepaid_quotes WHERE id=$1 FOR UPDATE`,[id]);
    if(!locked.rows[0]?.valid)throw new BillingError('This rate quote expired. Preview the rate again.',409);
    const active=await client.query("SELECT 1 FROM veilcall_call_reservations WHERE account_id=$1 AND status IN ('reserved','active')",[quote.accountId]);
    if(active.rowCount)throw new BillingError('Finish or cancel your current test before reserving another call.',409);
    if(quote.maxSeconds<60 || quote.heldMicro===0)throw new BillingError('Add test calling credit before reserving this call.',402);
    if(await spendable(client,current)<quote.heldMicro)throw new BillingError('Available credit changed. Preview the rate again.',409);
    const reservationId=randomUUID();
    await client.query(`INSERT INTO veilcall_call_reservations(id,account_id,quote_id,to_number,from_number,route,rate_micro,fee_micro,held_micro,max_seconds,expires_at,rate_accepted_at,rate_acceptance_version)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()+interval '45 seconds',now(),'prepaid-test-v1')`,
    [reservationId,quote.accountId,id,quote.to,quote.from,quote.route,quote.rateMicro,quote.feeMicro,quote.heldMicro,quote.maxSeconds]);
    await client.query('UPDATE veilcall_billing_accounts SET held_micro=held_micro+$2,updated_at=now() WHERE id=$1',[quote.accountId,quote.heldMicro]);
    return reservationId;
  });
}
export async function ownedPrepaidReservation(operatorId:string,id:string):Promise<CallReservation|null> {
  return (await reviewDatabase().query<CallReservation>(`SELECT ${reservationFields} FROM veilcall_call_reservations r
    JOIN veilcall_billing_accounts a ON a.id=r.account_id WHERE r.id=$1 AND r.quote_id IS NOT NULL AND a.operator_id=$2 AND a.mode='test'`,[id,operatorId])).rows[0]??null;
}
export async function activatePrepaidTest(operatorId:string,id:string,scenario:PrepaidScenario,requestedSeconds:number):Promise<void> {
  const reservation=await ownedPrepaidReservation(operatorId,id);if(!reservation)throw new BillingError('Test call not found.',404);
  await billingTransaction(async client=>{
    const current=await lockBillingAccount(client,reservation.accountId);requireUsableAccount(current);
    const locked=await client.query(`SELECT status,expires_at>now() AS valid FROM veilcall_call_reservations WHERE id=$1 FOR UPDATE`,[id]);
    const existing=await client.query('SELECT scenario,requested_seconds FROM veilcall_prepaid_test_runs WHERE reservation_id=$1',[id]);
    if(existing.rows[0]){
      if(existing.rows[0].scenario!==scenario || existing.rows[0].requested_seconds!==requestedSeconds)throw new BillingError('This test already started with a different outcome.',409);
      return; // Lost start responses can be retried without consuming the permit again.
    }
    if(locked.rows[0]?.status!=='reserved' || !locked.rows[0].valid)throw new BillingError('This call permit expired or was already used.',409);
    const parentSid='CA'+randomBytes(16).toString('hex'),childSid='CA'+randomBytes(16).toString('hex');
    const seconds=scenario==='completed' ? Math.min(requestedSeconds,reservation.maxSeconds) : 0;
    const twiml=prepaidDialTwiML(reservation);
    await client.query(`UPDATE veilcall_call_reservations SET status='active',call_sid=$2 WHERE id=$1`,[id,parentSid]);
    await client.query(`INSERT INTO veilcall_prepaid_test_runs(reservation_id,parent_sid,child_sid,scenario,requested_seconds,connected_seconds,duration_limit,twiml,finishes_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+(($6::integer+35)*interval '1 second'))`,
    [id,parentSid,childSid,scenario,requestedSeconds,seconds,reservation.maxSeconds,twiml]);
  });
}
export async function cancelPrepaidTest(operatorId:string,id:string):Promise<void> {
  const reservation=await ownedPrepaidReservation(operatorId,id);if(!reservation)throw new BillingError('Test call not found.',404);
  await billingTransaction(async client=>{
    await lockBillingAccount(client,reservation.accountId);
    const result=await client.query(`UPDATE veilcall_call_reservations SET status='released',charge_micro=0,duration_seconds=0,settled_at=now()
      WHERE id=$1 AND status='reserved' RETURNING held_micro AS held`,[id]);
    if(result.rows[0])await client.query('UPDATE veilcall_billing_accounts SET held_micro=held_micro-$2,updated_at=now() WHERE id=$1',[reservation.accountId,result.rows[0].held]);
    else {
      const row=await client.query('SELECT status FROM veilcall_call_reservations WHERE id=$1',[id]);
      if(row.rows[0]?.status!=='released')throw new BillingError('A started test must be settled before its credit is released.',409);
    }
  });
}
export async function completeTestProviderRun(operatorId:string,id:string,fastForward:boolean):Promise<TestCallProof|null> {
  const reservation=await ownedPrepaidReservation(operatorId,id);if(!reservation || !reservation.callSid)throw new BillingError('Started test call not found.',404);
  return billingTransaction(async client=>{
    await lockBillingAccount(client,reservation.accountId);
    const result=await client.query(`UPDATE veilcall_prepaid_test_runs SET completed_at=COALESCE(completed_at,now())
      WHERE reservation_id=$1 AND ($2 OR completed_at IS NOT NULL OR finishes_at<=now())
      RETURNING parent_sid,child_sid,scenario,connected_seconds`,[id,fastForward]);
    const run=result.rows[0];if(!run)return null;
    return {source:'prepaid-test',accountSid:testProviderAccount,
      parent:{sid:run.parent_sid,from:`client:${operatorId}`,status:'completed',duration:run.connected_seconds+35},
      child:{sid:run.child_sid,parentSid:run.parent_sid,to:reservation.to,from:reservation.from,status:run.scenario,duration:run.connected_seconds}};
  });
}
export async function recoverablePrepaidReservation(operatorId:string):Promise<string|null> {
  const account=await getBillingAccount(operatorId,'test');
  return billingTransaction(async client=>{
    await lockBillingAccount(client,account.id);await expireUnusedReservations(client,account.id);
    return (await client.query(`SELECT r.id FROM veilcall_call_reservations r JOIN veilcall_prepaid_test_runs t ON t.reservation_id=r.id
      WHERE r.account_id=$1 AND r.status='active' AND (t.completed_at IS NOT NULL OR t.finishes_at<=now()) LIMIT 1`,[account.id])).rows[0]?.id??null;
  });
}
export async function readPrepaidState(operatorId:string):Promise<{account:BillingAccount;session:PrepaidSession|null}> {
  const account=await getBillingAccount(operatorId,'test');
  const result=await reviewDatabase().query(`SELECT r.id,r.to_number AS "to",r.from_number AS "from",r.route,r.rate_micro AS "rateMicro",r.fee_micro AS "feeMicro",
    r.max_seconds AS "maxSeconds",r.held_micro AS "heldMicro",r.expires_at::text AS "expiresAt",r.status,
    CASE WHEN r.status='released' THEN 0 ELSE r.charge_micro END AS "chargeMicro",r.duration_seconds AS seconds,
    CASE WHEN t.reservation_id IS NULL THEN NULL ELSE jsonb_build_object('scenario',t.scenario,'requestedSeconds',t.requested_seconds,
      'connectedSeconds',t.connected_seconds,'durationLimit',t.duration_limit,'finishesAt',t.finishes_at,'completedAt',t.completed_at) END AS run
    FROM veilcall_call_reservations r LEFT JOIN veilcall_prepaid_test_runs t ON t.reservation_id=r.id
    WHERE r.account_id=$1 AND r.quote_id IS NOT NULL ORDER BY (r.status IN ('reserved','active')) DESC,r.created_at DESC,r.id DESC LIMIT 1`,[account.id]);
  const row=result.rows[0];
  const session:PrepaidSession|null=row ? {...row,expiresAt:new Date(row.expiresAt).toISOString(),run:row.run ? {...row.run,
    finishesAt:new Date(row.run.finishesAt).toISOString(),completedAt:row.run.completedAt ? new Date(row.run.completedAt).toISOString() : null} : null} : null;
  return {account,session};
}
