import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { reviewDatabase } from "@/lib/review-db";
import { billingTransaction } from "@/lib/customer-access";
import { BillingError } from "@/lib/billing-config";
import { reservationAmounts, usageCharge } from "@/lib/billing-rates";
import type { BillingAccount, BillingMode, BillingOrder, BillingRate, CallReservation } from "@/lib/billing-types";

export const accountFields=`id,operator_id AS "operatorId",mode,stripe_customer_id AS "customerId",subscription_id AS "subscriptionId",
  subscription_status AS "subscriptionStatus",paid_until::text AS "paidUntil",balance_micro::float8 AS "balanceMicro",
  held_micro::float8 AS "heldMicro",blocked`;
const orderFields=`id,account_id AS "accountId",kind,amount_cents AS "amountCents",price_id AS "priceId",status,
  checkout_id AS "checkoutId",checkout_url AS "checkoutUrl",payment_intent_id AS "paymentIntentId",offer_id AS "offerId"`;
export const reservationFields=`r.id,r.account_id AS "accountId",a.operator_id AS "operatorId",a.mode,r.to_number AS "to",r.from_number AS "from",r.route,
  r.rate_micro AS "rateMicro",r.fee_micro AS "feeMicro",r.held_micro AS "heldMicro",r.max_seconds AS "maxSeconds",r.status,
  r.call_sid AS "callSid",r.expires_at::text AS "expiresAt"`;

export async function getBillingAccount(operatorId:string,mode:BillingMode):Promise<BillingAccount> {
  await reviewDatabase().query(`INSERT INTO veilcall_billing_accounts(id,operator_id,mode) VALUES($1,$2,$3)
    ON CONFLICT(operator_id,mode) DO NOTHING`,[randomUUID(),operatorId,mode]);
  return (await reviewDatabase().query<BillingAccount>(`SELECT ${accountFields} FROM veilcall_billing_accounts WHERE operator_id=$1 AND mode=$2`,[operatorId,mode])).rows[0];
}
export async function bindBillingCustomer(accountId:string,customerId:string):Promise<void> {
  const result=await reviewDatabase().query(`UPDATE veilcall_billing_accounts SET stripe_customer_id=$2,updated_at=now()
    WHERE id=$1 AND (stripe_customer_id IS NULL OR stripe_customer_id=$2) RETURNING id`,[accountId,customerId]);
  if(!result.rowCount)throw new BillingError("Billing account changed. Please try again.",409);
}
export async function lockBillingAccount(client:PoolClient,id:string):Promise<BillingAccount> {
  const result=await client.query<BillingAccount>(`SELECT ${accountFields} FROM veilcall_billing_accounts WHERE id=$1 FOR UPDATE`,[id]);
  if(!result.rows[0])throw new BillingError("Billing account not found.",404);
  return result.rows[0];
}
export async function appendBillingEntry(client:PoolClient,accountId:string,reference:string,kind:"topup"|"usage"|"refund",amountMicro:number,description:string) {
  if(!Number.isSafeInteger(amountMicro))throw new BillingError("Invalid ledger amount.");
  const inserted=await client.query(`INSERT INTO veilcall_billing_ledger(id,account_id,reference,kind,amount_micro,description)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(account_id,reference) DO NOTHING RETURNING id`,[randomUUID(),accountId,reference,kind,amountMicro,description]);
  if(inserted.rowCount)await client.query("UPDATE veilcall_billing_accounts SET balance_micro=balance_micro+$2,updated_at=now() WHERE id=$1",[accountId,amountMicro]);
  return Boolean(inserted.rowCount);
}
export async function listBillingEntries(accountId:string) {
  return (await reviewDatabase().query(`SELECT id,kind,amount_micro::float8 AS "amountMicro",description,created_at::text AS "createdAt"
    FROM veilcall_billing_ledger WHERE account_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50`,[accountId])).rows;
}
export async function subscriptionMonthlyCents(account:BillingAccount):Promise<number|null>{
  if(!account.subscriptionId)return null;
  return (await reviewDatabase().query(`SELECT amount_cents AS amount FROM veilcall_billing_orders WHERE account_id=$1
    AND subscription_id=$2 AND kind='subscription' AND status='paid' ORDER BY created_at DESC LIMIT 1`,[account.id,account.subscriptionId])).rows[0]?.amount??null;
}
export async function createBillingOrder(accountId:string,kind:"subscription"|"topup",amountCents:number,priceId:string|null,offerId:string|null=null):Promise<BillingOrder> {
  return billingTransaction(async client=>{
    const account=await lockBillingAccount(client,accountId);
    if(account.blocked)throw new BillingError("Billing is paused. Contact the owner.",403);
    if(account.mode==='live'){
      if(!offerId)throw new BillingError('A published offer is required before payment.',403);
      const release=(await client.query(`SELECT o.provider_account_sid AS provider,o.config FROM veilcall_pilot_control c
        JOIN veilcall_pilot_offers o ON o.id=c.active_id WHERE c.singleton=true AND c.paused=false AND o.id=$1 FOR SHARE OF c`,[offerId])).rows[0];
      if(!release||release.provider!==process.env.TWILIO_ACCOUNT_SID?.trim())throw new BillingError('New checkouts are paused or the offer changed.',409);
      if((kind==='subscription'&&(priceId!==release.config.priceId||amountCents!==release.config.monthlyCents))||(kind==='topup'&&(!release.config.topups.includes(amountCents)||priceId!==null)))throw new BillingError('Payment amounts must match the approved offer.',403);
      if(kind==='topup'&&(account.subscriptionStatus!=='active'||!account.paidUntil||Date.parse(account.paidUntil)<=Date.now()))throw new BillingError('A current paid subscription is required before adding credit.',402);
      const usable=await client.query(`SELECT 1 FROM veilcall_operator_access a JOIN veilcall_caller_identities i ON i.operator_id=a.operator_id
        WHERE a.operator_id=$1 AND a.status='approved' AND i.status='active' AND i.account_sid=$2 AND $3::jsonb ? i.phone_number FOR SHARE OF a,i`,[account.operatorId,release.provider,JSON.stringify(release.config.rates)]);
      if(!usable.rowCount||!(await client.query(`SELECT 1 FROM veilcall_policy_acceptances WHERE operator_id=$1 AND offer_id=$2
        AND (immediate_service_requested OR accepted_at<=now()-interval '14 days')`,[account.operatorId,offerId])).rowCount)throw new BillingError('Account, calling number, rate and policy approval are required before payment.',409);
    }
    // An expired browser redirect is not evidence that Stripe's session expired.
    // Keep creating orders reserved for their full provider expiration window.
    await client.query(`UPDATE veilcall_billing_orders SET status='expired' WHERE account_id=$1 AND status IN ('creating','open') AND expires_at<now()`,[accountId]);
    const pending=await client.query<BillingOrder>(`SELECT ${orderFields} FROM veilcall_billing_orders
      WHERE account_id=$1 AND status IN ('creating','open') ORDER BY created_at DESC LIMIT 1`,[accountId]);
    if(pending.rows[0]) {
      if(pending.rows[0].kind!==kind || pending.rows[0].amountCents!==amountCents || pending.rows[0].priceId!==priceId || (pending.rows[0].offerId??null)!==offerId)throw new BillingError("Finish your existing checkout before starting another payment.",409);
      return pending.rows[0];
    }
    if(kind==="subscription" && account.subscriptionId && !["canceled","incomplete_expired","none"].includes(account.subscriptionStatus))
      throw new BillingError("You already have a subscription. Use Manage billing to update it.",409);
    return (await client.query<BillingOrder>(`INSERT INTO veilcall_billing_orders(id,account_id,kind,amount_cents,price_id,offer_id,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,date_trunc('second',now())+interval '1 hour') RETURNING ${orderFields}`,[randomUUID(),accountId,kind,amountCents,priceId,offerId])).rows[0];
  });
}
export async function billingOrderExpiry(orderId:string):Promise<number> {
  const result=await reviewDatabase().query("SELECT extract(epoch FROM expires_at)::bigint AS expiry FROM veilcall_billing_orders WHERE id=$1",[orderId]);
  return Number(result.rows[0].expiry);
}
export async function attachBillingCheckout(orderId:string,checkoutId:string,url:string) {
  await reviewDatabase().query(`UPDATE veilcall_billing_orders SET checkout_id=$2,checkout_url=$3,
    status=CASE WHEN status='creating' THEN 'open' ELSE status END,updated_at=now()
    WHERE id=$1 AND (checkout_id IS NULL OR checkout_id=$2)`,[orderId,checkoutId,url]);
}
export async function freezeCheckoutParameters<T extends object>(orderId:string,params:T):Promise<T> {
  return (await reviewDatabase().query(`UPDATE veilcall_billing_orders SET checkout_params=COALESCE(checkout_params,$2::jsonb)
    WHERE id=$1 RETURNING checkout_params AS params`,[orderId,JSON.stringify(params)])).rows[0].params;
}
export async function expireUnusedReservations(client:PoolClient,accountId:string) {
  const released=await client.query<{heldMicro:number}>(`UPDATE veilcall_call_reservations SET status='released',settled_at=now()
    WHERE account_id=$1 AND status='reserved' AND expires_at<=now() RETURNING held_micro AS "heldMicro"`,[accountId]);
  const amount=released.rows.reduce((sum,row)=>sum+row.heldMicro,0);
  if(amount)await client.query("UPDATE veilcall_billing_accounts SET held_micro=held_micro-$2,updated_at=now() WHERE id=$1",[accountId,amount]);
}
export async function reserveBillingCall(operatorId:string,mode:BillingMode,to:string,from:string,rate:BillingRate):Promise<CallReservation> {
  if(rate.mode!==mode)throw new BillingError("Calling quote is from another environment.",403);
  const account=await getBillingAccount(operatorId,mode);
  return billingTransaction(async client=>{
    const current=await lockBillingAccount(client,account.id);
    await expireUnusedReservations(client,current.id);
    const refreshed=await lockBillingAccount(client,current.id);
    // A paid-through timestamp is required; an active subscription alone is insufficient.
    if(refreshed.blocked || refreshed.subscriptionStatus!=="active" || !refreshed.paidUntil || new Date(refreshed.paidUntil).getTime()<=Date.now())
      throw new BillingError("An active, paid subscription is required before calling.",402);
    const active=await client.query("SELECT 1 FROM veilcall_call_reservations WHERE account_id=$1 AND status IN ('reserved','active')",[current.id]);
    if(active.rowCount)throw new BillingError("Finish your current call before starting another.",409);
    const today=await client.query(`SELECT COALESCE(SUM(charge_micro),0)::float8 AS spent FROM veilcall_call_reservations
      WHERE account_id=$1 AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AND status='settled'`,[current.id]);
    const available=Math.min(refreshed.balanceMicro-refreshed.heldMicro,10_000_000-Number(today.rows[0].spent));
    const amounts=reservationAmounts(available,rate);
    const id=randomUUID();
    await client.query(`INSERT INTO veilcall_call_reservations(id,account_id,to_number,from_number,route,rate_micro,fee_micro,held_micro,max_seconds,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '45 seconds')`,[id,current.id,to,from,rate.route,rate.rateMicro,rate.feeMicro,amounts.heldMicro,amounts.maxSeconds]);
    await client.query("UPDATE veilcall_billing_accounts SET held_micro=held_micro+$2,updated_at=now() WHERE id=$1",[current.id,amounts.heldMicro]);
    return (await client.query<CallReservation>(`SELECT ${reservationFields} FROM veilcall_call_reservations r JOIN veilcall_billing_accounts a ON a.id=r.account_id WHERE r.id=$1`,[id])).rows[0];
  });
}
export async function getCallReservation(id:string):Promise<CallReservation|null> {
  return (await reviewDatabase().query<CallReservation>(`SELECT ${reservationFields} FROM veilcall_call_reservations r
    JOIN veilcall_billing_accounts a ON a.id=r.account_id WHERE r.id=$1`,[id])).rows[0]??null;
}
export async function consumeBillingReservation(id:string,operatorId:string,to:string,from:string,callSid:string):Promise<CallReservation> {
  const reservation=await getCallReservation(id);
  if(!reservation || reservation.operatorId!==operatorId || reservation.to!==to || reservation.from!==from)
    throw new BillingError("Call permit does not match this account or destination.",403);
  return billingTransaction(async client=>{
    const account=await lockBillingAccount(client,reservation.accountId);
    if(account.blocked || account.subscriptionStatus!=="active" || !account.paidUntil || new Date(account.paidUntil).getTime()<=Date.now())
      throw new BillingError("Calling access is paused.",403);
    const result=await client.query(`UPDATE veilcall_call_reservations SET status='active',call_sid=$2
      WHERE id=$1 AND status='reserved' AND expires_at>now() RETURNING id`,[id,callSid]);
    if(!result.rowCount)throw new BillingError("This call permit was already used or expired.",403);
    return {...reservation,status:"active",callSid};
  });
}
export async function settleBillingReservation(id:string,callSid:string,seconds:number,childSid:string|null,providerCost:Record<string,unknown>|null) {
  const reservation=await getCallReservation(id);
  if(!reservation || reservation.callSid!==callSid)throw new BillingError("Call settlement does not match its permit.",403);
  return billingTransaction(async client=>{
    await lockBillingAccount(client,reservation.accountId);
    const result=await client.query("SELECT status FROM veilcall_call_reservations WHERE id=$1 FOR UPDATE",[id]);
    if(result.rows[0]?.status==="settled")return;
    if(result.rows[0]?.status!=="active")throw new BillingError("Call settlement is not ready.",409);
    const rawCharge=usageCharge(seconds,reservation.rateMicro,reservation.feeMicro);
    // Never charge more than the quote. Investigate provider duration discrepancies.
    const charge=Math.min(rawCharge,reservation.heldMicro);
    if(reservation.mode==='live' && providerCost && typeof providerCost==='object' && 'source' in providerCost && providerCost.source==='twilio-api'){
      const evidence=providerCost as {child?:{sid?:string;status?:string}};
      if(evidence.child?.sid!==childSid||!['completed','busy','failed','no-answer','canceled'].includes(evidence.child?.status??''))throw new BillingError('Canonical call outcome is unavailable.',409);
      await client.query(`UPDATE veilcall_calls SET status=$3,duration_seconds=$4,updated_at=now() WHERE call_sid=$1 AND operator_id=$2`,[callSid,reservation.operatorId,evidence.child.status,seconds]);
    }
    await appendBillingEntry(client,reservation.accountId,`call:${id}`,"usage",-charge,`${reservation.route} · ${seconds}s${reservation.mode==="test" ? " · simulation" : ""}`);
    await client.query(`UPDATE veilcall_billing_accounts SET held_micro=held_micro-$2,blocked=blocked OR $3,updated_at=now() WHERE id=$1`,
      [reservation.accountId,reservation.heldMicro,rawCharge>reservation.heldMicro]);
    await client.query(`UPDATE veilcall_call_reservations SET status='settled',duration_seconds=$2,charge_micro=$3,child_sid=$4,provider_cost=$5::jsonb,settled_at=now()
      WHERE id=$1`,[id,seconds,charge,childSid,JSON.stringify(providerCost)]);
  });
}
