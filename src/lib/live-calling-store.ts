import 'server-only';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {parsePhoneNumberFromString} from 'libphonenumber-js/max';
import {BillingError,liveBillingEnabled} from '@/lib/billing-config';
import {billingTransaction} from '@/lib/customer-access';
import {getBillingAccount,lockBillingAccount,expireUnusedReservations} from '@/lib/billing-store';
import {reservationAmounts} from '@/lib/billing-rates';
import type {BillingAccount,BillingRate} from '@/lib/billing-types';
import type {PrepaidQuote} from '@/lib/prepaid-types';
import type {PilotOffer} from '@/lib/pilot-types';
import {pilotOfferIssues} from '@/lib/pilot-values';
import {draftRoutes,type DraftRoute} from '@/lib/rate-draft-types';
import {validateCallingDestination} from '@/lib/destination';

export interface LiveQuote extends PrepaidQuote {offerId:string;availableMicro:number}
const fields=`q.id,q.to_number AS "to",q.from_number AS "from",q.route,q.rate_micro AS "rateMicro",q.fee_micro AS "feeMicro",
  q.max_seconds AS "maxSeconds",q.held_micro AS "heldMicro",q.expires_at::text AS "expiresAt",q.offer_id AS "offerId"`;
export function liveRoute(to:string,from:string):DraftRoute {
  const destination=parsePhoneNumberFromString(to),origin=parsePhoneNumberFromString(from);
  const route=`${destination?.country}_${destination?.getType()}`;
  if(validateCallingDestination(to)!==to||!destination?.isValid()||destination.number!==to||!origin?.isValid()||origin.number!==from||!draftRoutes.some(row=>row.key===route))throw new BillingError('Only approved ordinary UK/Australia routes are available for paid calls.');
  return route as DraftRoute;
}
// Row share locks keep a release pause, customer suspension or number revocation
// from racing the credit hold / one-use redemption commit.
export async function assertLiveAdmission(client:PoolClient,operatorId:string,from:string,offerId?:string):Promise<{id:string;config:PilotOffer}>{
  if(!liveBillingEnabled())throw new BillingError('Paid calling is not open yet.',402);
  const current=(await client.query<{id:string;config:PilotOffer}>(`SELECT o.id,o.config FROM veilcall_pilot_control c
    JOIN veilcall_pilot_offers o ON o.id=c.active_id WHERE c.singleton=true AND c.paused=false AND o.provider_account_sid=$1
    FOR SHARE OF c`,[process.env.TWILIO_ACCOUNT_SID?.trim()])).rows[0];
  if(!current||(offerId&&current.id!==offerId)||pilotOfferIssues(current.config).length)throw new BillingError('The offer changed or paid calling is paused. Refresh Billing & credit.',409);
  const access=await client.query("SELECT 1 FROM veilcall_operator_access WHERE operator_id=$1 AND status='approved' FOR SHARE",[operatorId]);
  if(!access.rowCount)throw new BillingError('Account approval is required.',403);
  const caller=await client.query(`SELECT 1 FROM veilcall_caller_identities WHERE operator_id=$1 AND phone_number=$2
    AND status='active' AND account_sid=$3 FOR SHARE`,[operatorId,from,process.env.TWILIO_ACCOUNT_SID?.trim()]);
  if(!caller.rowCount)throw new BillingError('This calling number is no longer assigned to you.',403);
  const accepted=await client.query(`SELECT 1 FROM veilcall_policy_acceptances WHERE operator_id=$1 AND offer_id=$2
    AND (immediate_service_requested OR accepted_at<=now()-interval '14 days')`,[operatorId,current.id]);
  if(!accepted.rowCount)throw new BillingError('Review the service policies in Billing & credit. Without an immediate-start request, service begins after the 14-day waiting period.',402);
  return current;
}
function requireFunded(account:BillingAccount):void {
  if(account.mode!=='live'||account.blocked||account.subscriptionStatus!=='active'||!account.paidUntil||Date.parse(account.paidUntil)<=Date.now())throw new BillingError('An active paid subscription and unpaused live account are required.',402);
}
async function spendable(client:PoolClient,account:BillingAccount):Promise<number>{
  const result=await client.query(`SELECT COALESCE(SUM(charge_micro),0)::float8 AS spent FROM veilcall_call_reservations
    WHERE account_id=$1 AND status='settled' AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,[account.id]);
  return Math.max(0,Math.min(account.balanceMicro-account.heldMicro,10_000_000-Number(result.rows[0].spent)));
}
export async function createLiveQuote(operatorId:string,to:string,from:string):Promise<LiveQuote>{
  const route=liveRoute(to,from),account=await getBillingAccount(operatorId,'live');
  return billingTransaction(async client=>{
    await lockBillingAccount(client,account.id);await expireUnusedReservations(client,account.id);
    const current=await lockBillingAccount(client,account.id);requireFunded(current);
    const release=await assertLiveAdmission(client,operatorId,from),price=release.config.rates[from]?.[route];
    if(!price)throw new BillingError('There is no approved price for this calling number and destination route.',409);
    const rate:BillingRate={...price,route,mode:'live'},availableMicro=await spendable(client,current),amounts=reservationAmounts(availableMicro,rate);
    const quote=(await client.query<LiveQuote>(`INSERT INTO veilcall_prepaid_quotes AS q(id,account_id,to_number,from_number,route,rate_micro,fee_micro,max_seconds,held_micro,expires_at,offer_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '45 seconds',$10) RETURNING ${fields}`,
    [randomUUID(),account.id,to,from,route,price.rateMicro,price.feeMicro,amounts.maxSeconds,amounts.heldMicro,release.id])).rows[0];
    return {...quote,availableMicro};
  });
}
export async function reserveLiveQuote(operatorId:string,id:string,to:string,from:string,consent:unknown):Promise<string>{
  if(consent!==true||!/^[0-9a-f-]{36}$/.test(id))throw new BillingError('Accept the displayed rate and maximum charge.');
  const account=await getBillingAccount(operatorId,'live');
  return billingTransaction(async client=>{
    await lockBillingAccount(client,account.id);await expireUnusedReservations(client,account.id);
    const current=await lockBillingAccount(client,account.id);requireFunded(current);
    const quote=(await client.query<LiveQuote&{valid:boolean}>(`SELECT ${fields},q.expires_at>now() AS valid FROM veilcall_prepaid_quotes q
      WHERE q.id=$1 AND q.account_id=$2 FOR UPDATE`,[id,account.id])).rows[0];
    if(!quote||quote.to!==to||quote.from!==from||!quote.valid||!quote.offerId)throw new BillingError('This quote expired or does not match your call. Preview a new rate.',409);
    const release=await assertLiveAdmission(client,operatorId,from,quote.offerId),price=release.config.rates[from]?.[liveRoute(to,from)];
    if(!price||quote.rateMicro!==price.rateMicro||quote.feeMicro!==price.feeMicro)throw new BillingError('The rate changed. Preview it again.',409);
    const existing=(await client.query('SELECT id,status,expires_at>now() AS valid FROM veilcall_call_reservations WHERE quote_id=$1',[id])).rows[0];
    if(existing?.status==='reserved'&&existing.valid)return existing.id;
    if(existing)throw new BillingError('This quote has already been used.',409);
    if((await client.query("SELECT 1 FROM veilcall_call_reservations WHERE account_id=$1 AND status IN ('reserved','active')",[account.id])).rowCount)throw new BillingError('Your previous call is active or awaiting reconciliation. Check Billing & credit.',409);
    if(await spendable(client,current)<quote.heldMicro)throw new BillingError('Available credit changed. Preview the rate again.',409);
    const reservationId=randomUUID();
    await client.query(`INSERT INTO veilcall_call_reservations(id,account_id,quote_id,to_number,from_number,route,rate_micro,fee_micro,held_micro,max_seconds,expires_at,rate_accepted_at,rate_acceptance_version)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,LEAST($11::timestamptz,now()+interval '45 seconds'),now(),'prepaid-live-v1')`,
    [reservationId,account.id,id,to,from,quote.route,quote.rateMicro,quote.feeMicro,quote.heldMicro,quote.maxSeconds,quote.expiresAt]);
    await client.query('UPDATE veilcall_billing_accounts SET held_micro=held_micro+$2,updated_at=now() WHERE id=$1',[account.id,quote.heldMicro]);
    return reservationId;
  });
}
export async function liveCallState(operatorId:string){
  const account=await getBillingAccount(operatorId,'live');
  return billingTransaction(async client=>{
    await lockBillingAccount(client,account.id);await expireUnusedReservations(client,account.id);
    return (await client.query(`SELECT id,call_sid AS "callSid",to_number AS "to",from_number AS "from",status,held_micro AS "heldMicro",charge_micro AS "chargeMicro",
      duration_seconds AS seconds,max_seconds AS "maxSeconds" FROM veilcall_call_reservations WHERE account_id=$1
      ORDER BY (status IN ('reserved','active')) DESC,created_at DESC,id DESC LIMIT 1`,[account.id])).rows[0]??null;
  });
}
