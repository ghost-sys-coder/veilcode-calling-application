import "server-only";
import type Stripe from "stripe";
import { stripeService } from "@/lib/stripe";
import { billingOrigin, BillingError, requireTestBilling,requireBillingEnvironment } from "@/lib/billing-config";
import { getStripeMode } from "@/lib/stripe-config";
import { operatorHasAccess } from "@/lib/access";
import { isNumberAdmin } from "@/lib/number-access";
import { billingTransaction } from "@/lib/customer-access";
import { accountFields, getBillingAccount, bindBillingCustomer, createBillingOrder, billingOrderExpiry, attachBillingCheckout,
  appendBillingEntry, freezeCheckoutParameters } from "@/lib/billing-store";
import type { BillingAccount, BillingOrder } from "@/lib/billing-types";
import {requirePilotCustomer} from '@/lib/pilot-service';
import {policiesAccepted,policyServiceReady} from '@/lib/pilot-store';

export function stripeObjectId(value:unknown):string|null {
  return typeof value==="string" ? value : value && typeof value==="object" && "id" in value && typeof value.id==="string" ? value.id : null;
}
export function assertTestObject(value:{livemode?:boolean}) {
  if(value.livemode!==false)throw new BillingError("The payment environment does not match.",403);
}
export function assertBillingObject(value:{livemode?:boolean}) {
  if(value.livemode!==(getStripeMode()==='live'))throw new BillingError('The payment environment does not match.',403);
}
export async function requireBillingEligibility(operatorId:string) {
  if(!(await operatorHasAccess(operatorId)))throw new BillingError("Your account must be approved before you can make a payment.",403);
  // Sandbox access is owner-only until prices/policies and a customer pilot are approved.
  if(getStripeMode()==='test'){
    if(!isNumberAdmin(operatorId))throw new BillingError("The billing sandbox is currently available to the application owner.",403);
  }else await requirePilotCustomer(operatorId);
}
async function customerForAccount(account:BillingAccount):Promise<string> {
  if(account.customerId)return account.customerId;
  const customer=await stripeService().customers.create({description:account.mode==='test'?"VeilCall billing sandbox":"VeilCall customer"},{idempotencyKey:`veilcall-customer-${account.id}`});
  assertBillingObject(customer);
  await bindBillingCustomer(account.id,customer.id);
  return customer.id;
}
export async function startBillingCheckout(operatorId:string,kind:unknown,amount:unknown):Promise<string> {
  const environment=requireBillingEnvironment();await requireBillingEligibility(operatorId);
  const release=environment.mode==='live'?await requirePilotCustomer(operatorId):null;
  if(release&&!await policiesAccepted(operatorId,release.id))throw new BillingError('Review and accept the service policies before payment.',409);
  if(release&&!await policyServiceReady(operatorId,release.id))throw new BillingError('Without an immediate-service request, checkout opens after the 14-day waiting period.',409);
  const config=release ? {...release.config,mode:'live' as const} : requireTestBilling();
  if(kind!=="subscription" && kind!=="topup")throw new BillingError("Choose a subscription or calling-credit amount.");
  const amountCents=kind==="subscription" ? config.monthlyCents : amount;
  if(typeof amountCents!=="number" || !Number.isSafeInteger(amountCents) || (kind==="topup" && !config.topups.includes(amountCents)))
    throw new BillingError("Choose one of the available calling-credit amounts.");
  const account=await getBillingAccount(operatorId,environment.mode);
  if(account.blocked)throw new BillingError("Billing is paused. Contact the owner.",403);
  if(kind==="topup" && (account.subscriptionStatus!=="active" || !account.paidUntil || new Date(account.paidUntil).getTime()<=Date.now()))
    throw new BillingError("Complete the test subscription before adding calling credit.",402);
  const stripe=stripeService();
  if(kind==="subscription"){
    const price=await stripe.prices.retrieve(config.priceId);assertBillingObject(price);
    if(!price.active || price.currency!=="usd" || price.unit_amount!==config.monthlyCents || price.type!=="recurring" ||
      price.recurring?.interval!=="month" || price.recurring.interval_count!==1 || price.billing_scheme!=="per_unit")
      throw new BillingError("The test subscription price is not configured correctly.",503);
  }
  const customer=await customerForAccount(account);
  const order=await createBillingOrder(account.id,kind,amountCents,kind==="subscription" ? config.priceId : null,release?.id??null);
  if(order.checkoutUrl)return order.checkoutUrl;
  const origin=billingOrigin();
  // All request parameters are derived from the persisted order. Retries use
  // exactly the same body and idempotency key, including the expiration time.
  const params:Stripe.Checkout.SessionCreateParams={
    customer,mode:kind==="subscription" ? "subscription" : "payment",client_reference_id:order.id,
    success_url:`${origin}/console/billing?checkout=returned`,cancel_url:`${origin}/console/billing?checkout=canceled`,
    expires_at:await billingOrderExpiry(order.id),
    line_items:kind==="subscription" ? [{price:order.priceId!,quantity:1}]
      : [{price_data:{currency:"usd",unit_amount:amountCents,product_data:{name:environment.mode==='test'?"VeilCall test calling credit":"VeilCall calling credit",description:environment.mode==='test'?"Sandbox credit only. Cannot fund real calls.":"Prepaid calling credit. Subscription purchased separately; no automatic top-up."}},quantity:1}],
    integration_identifier:`veilcall_sandbox_${order.id.replaceAll("-","").slice(0,8).replace(/[0-9]/g,n=>String.fromCharCode(97+Number(n)))}`,
  };
  const frozen=await freezeCheckoutParameters(order.id,params);
  const session=await stripe.checkout.sessions.create(frozen,{idempotencyKey:`veilcall-checkout-${order.id}`});
  assertBillingObject(session);
  if(!session.url)throw new BillingError("Checkout could not be opened.",503);
  const url=new URL(session.url);
  if(url.protocol!=="https:" || url.hostname!=="checkout.stripe.com")throw new BillingError("Checkout returned an unexpected address.",503);
  await attachBillingCheckout(order.id,session.id,session.url);
  return session.url;
}
export async function openBillingPortal(operatorId:string):Promise<string> {
  const {mode}=requireBillingEnvironment();
  if(mode==='test')await requireBillingEligibility(operatorId);
  // Existing customers must still be able to cancel or obtain invoices while
  // admission is paused or their workspace is suspended.
  const account=await getBillingAccount(operatorId,mode);
  if(!account.customerId)throw new BillingError("Complete a test checkout before managing billing.",409);
  const session=await stripeService().billingPortal.sessions.create({customer:account.customerId,return_url:`${billingOrigin()}/console/billing`,
    ...(process.env[mode==='test'?'STRIPE_TEST_PORTAL_CONFIGURATION_ID':'STRIPE_PROD_PORTAL_CONFIGURATION_ID'] ? {configuration:process.env[mode==='test'?'STRIPE_TEST_PORTAL_CONFIGURATION_ID':'STRIPE_PROD_PORTAL_CONFIGURATION_ID']} : {})});
  const url=new URL(session.url);
  if(url.protocol!=="https:" || url.hostname!=="billing.stripe.com")throw new BillingError("Billing returned an unexpected address.",503);
  return session.url;
}

// Fetch the canonical subscription while holding the customer's DB row lock.
// This serializes updates and makes delayed/out-of-order events converge to
// Stripe's current state instead of replaying stale event snapshots.
async function syncSubscription(client:import("pg").PoolClient,account:BillingAccount,subscriptionId:string) {
  const stripe=stripeService();
  const subscription=await stripe.subscriptions.retrieve(subscriptionId,{expand:["latest_invoice"]});assertBillingObject(subscription);
  let priceId:string;
  if(account.mode==='live'){
    const owned=(await client.query(`SELECT price_id FROM veilcall_billing_orders WHERE account_id=$1 AND kind='subscription'
      AND price_id=$2 AND (subscription_id=$3 OR (subscription_id IS NULL AND status IN ('creating','open'))) ORDER BY created_at DESC LIMIT 1`,[account.id,subscription.items.data[0]?.price.id,subscription.id])).rows[0];
    if(!owned)throw new BillingError('Subscription is not attached to a server-created order.',403);priceId=owned.price_id;
  }else priceId=requireTestBilling().priceId;
  if(stripeObjectId(subscription.customer)!==account.customerId || subscription.items.data.length!==1 ||
    subscription.items.data[0].price.id!==priceId || subscription.items.data[0].quantity!==1)
    throw new BillingError("Subscription does not match this billing account.",403);
  if(account.subscriptionId && account.subscriptionId!==subscription.id && !["canceled","incomplete_expired","none"].includes(account.subscriptionStatus))
    throw new BillingError("A second subscription needs owner review.",409);
  const item=subscription.items.data[0];
  const invoice=subscription.latest_invoice;
  const paid=invoice && typeof invoice!=="string" && invoice.status==="paid";
  const until=paid ? new Date(item.current_period_end*1000).toISOString() : null;
  await client.query(`UPDATE veilcall_billing_accounts SET subscription_id=$2,subscription_status=$3,
    paid_until=$4,updated_at=now() WHERE id=$1`,[account.id,subscription.id,subscription.status,until]);
}

export async function processBillingEvent(event:Stripe.Event):Promise<void> {
  const {mode}=requireBillingEnvironment();assertBillingObject(event);
  const supported=["checkout.session.completed","checkout.session.async_payment_succeeded","checkout.session.async_payment_failed","checkout.session.expired",
    "customer.subscription.created","customer.subscription.updated","customer.subscription.deleted","invoice.paid","invoice.payment_failed",
    "charge.refunded","charge.dispute.created","charge.dispute.closed"];
  if(!supported.includes(event.type))return;
  const stripe=stripeService();
  const object=event.data.object;
  const objectId=stripeObjectId(object);
  if(!objectId)throw new BillingError("Payment event has no object identifier.");
  let customerId="customer" in object ? stripeObjectId(object.customer) : null;
  let charge:Stripe.Charge|null=null;
  if(event.type.startsWith("charge.dispute.")) {
    const dispute=await stripe.disputes.retrieve(objectId);assertBillingObject(dispute);
    const chargeId=stripeObjectId(dispute.charge);
    if(!chargeId)throw new BillingError("Dispute charge is not available.",409);
    charge=await stripe.charges.retrieve(chargeId);assertBillingObject(charge);customerId=stripeObjectId(charge.customer);
  }
  if(!customerId)return;
  await billingTransaction(async client=>{
    const mapped=await client.query<BillingAccount>(`SELECT ${accountFields} FROM veilcall_billing_accounts WHERE mode=$2 AND stripe_customer_id=$1 FOR UPDATE`,[customerId,mode]);
    const account=mapped.rows[0];if(!account)return;
    const inserted=await client.query(`INSERT INTO veilcall_billing_events(mode,event_id,event_type) VALUES($3,$1,$2) ON CONFLICT DO NOTHING RETURNING event_id`,[event.id,event.type,mode]);
    if(!inserted.rowCount)return;
    if(event.type.startsWith("checkout.session.")) {
      const session=await stripe.checkout.sessions.retrieve(objectId);assertBillingObject(session);
      if(stripeObjectId(session.customer)!==account.customerId)throw new BillingError("Checkout ownership mismatch.",403);
      const found=await client.query<BillingOrder>(`SELECT id,account_id AS "accountId",kind,amount_cents AS "amountCents",status,
        checkout_id AS "checkoutId",refunded_cents AS refunded FROM veilcall_billing_orders WHERE account_id=$1 AND (checkout_id=$2 OR (checkout_id IS NULL AND id::text=$3)) FOR UPDATE`,[account.id,session.id,session.client_reference_id]);
      const order=found.rows[0];if(!order)return;
      if(order.checkoutId && order.checkoutId!==session.id)throw new BillingError("Checkout session changed.",403);
      if(session.currency!=="usd" || session.amount_total!==order.amountCents || session.mode!==(order.kind==="subscription" ? "subscription" : "payment"))
        throw new BillingError("Checkout amount does not match its order.",403);
      const paymentIntentId=stripeObjectId(session.payment_intent),subscriptionId=stripeObjectId(session.subscription);
      if(session.payment_status==="paid" && session.status==="complete") {
        if(order.kind==="topup") {
          if(!paymentIntentId)throw new BillingError("Payment confirmation is incomplete.",409);
          const payment=await stripe.paymentIntents.retrieve(paymentIntentId);assertBillingObject(payment);
          if(payment.status!=="succeeded" || payment.amount_received!==order.amountCents || payment.currency!=="usd" || stripeObjectId(payment.customer)!==account.customerId)
            throw new BillingError("Payment does not match its order.",403);
          const latestChargeId=stripeObjectId(payment.latest_charge);
          if(!latestChargeId)throw new BillingError("Payment charge is not available.",409);
          const latestCharge=await stripe.charges.retrieve(latestChargeId);assertBillingObject(latestCharge);
          if(stripeObjectId(latestCharge.customer)!==account.customerId || (mode==='live'&&(stripeObjectId(latestCharge.payment_intent)!==paymentIntentId||latestCharge.currency!=='usd'||latestCharge.amount!==order.amountCents)))throw new BillingError('Charge ownership does not match its payment.',403);
          await appendBillingEntry(client,account.id,`topup:${order.id}`,"topup",order.amountCents*10000,mode==='test'?"Test calling credit":"Calling credit");
          // A refund/dispute can precede a delayed checkout event. Reconcile the
          // current charge now so late payment delivery cannot restore that money.
          const refunded=Number((order as BillingOrder & {refunded:number}).refunded);
          if(latestCharge.amount_refunded>refunded) {
            await appendBillingEntry(client,account.id,`refund-total:${latestCharge.id}:${latestCharge.amount_refunded}`,"refund",-(latestCharge.amount_refunded-refunded)*10000,mode==='test'?"Refunded test credit":"Refunded calling credit");
            await client.query("UPDATE veilcall_billing_orders SET refunded_cents=$2 WHERE id=$1",[order.id,latestCharge.amount_refunded]);
          }
          if(latestCharge.disputed || latestCharge.amount_refunded)await client.query("UPDATE veilcall_billing_accounts SET blocked=true WHERE id=$1",[account.id]);
        } else if(subscriptionId)await syncSubscription(client,account,subscriptionId);
        await client.query(`UPDATE veilcall_billing_orders SET status='paid',checkout_id=$2,payment_intent_id=$3,subscription_id=$4,updated_at=now() WHERE id=$1`,[order.id,session.id,paymentIntentId,subscriptionId]);
      } else if(order.status!=="paid") {
        const status=session.status==="expired" ? "expired" : ["failed","expired"].includes(order.status) ? order.status
          : event.type==="checkout.session.async_payment_failed" ? "failed" : "open";
        await client.query(`UPDATE veilcall_billing_orders SET checkout_id=$2,status=$3,updated_at=now() WHERE id=$1`,
          [order.id,session.id,status]);
      }
    } else if(event.type.startsWith("customer.subscription.")) {
      // Only our server-created price/customer pairing is eligible. There is no
      // grant based on client metadata or a successful redirect.
      await syncSubscription(client,account,objectId);
    } else if(event.type.startsWith("invoice.")) {
      const invoice=await stripe.invoices.retrieve(objectId);assertBillingObject(invoice);
      if(stripeObjectId(invoice.customer)!==account.customerId)throw new BillingError("Invoice ownership mismatch.",403);
      const subscriptionId=stripeObjectId(invoice.parent?.subscription_details?.subscription);
      if(subscriptionId)await syncSubscription(client,account,subscriptionId);
    } else if(event.type==="charge.refunded") {
      charge=await stripe.charges.retrieve(objectId);assertBillingObject(charge);
      if(stripeObjectId(charge.customer)!==account.customerId)throw new BillingError("Refund ownership mismatch.",403);
      const paymentId=stripeObjectId(charge.payment_intent);
      const result=await client.query(`SELECT id,kind,status,refunded_cents AS refunded FROM veilcall_billing_orders WHERE account_id=$1 AND payment_intent_id=$2 FOR UPDATE`,[account.id,paymentId]);
      const order=result.rows[0];
      // Pause the known customer's account even if the checkout mapping has
      // not arrived yet or this is a subscription-invoice payment. A delayed
      // top-up callback also reconciles the charge's cumulative refund itself.
      if(!order){await client.query("UPDATE veilcall_billing_accounts SET blocked=true,updated_at=now() WHERE id=$1",[account.id]);return;}
      if(order.kind==="topup" && order.status==="paid" && charge.amount_refunded>order.refunded) {
        await appendBillingEntry(client,account.id,`refund-total:${charge.id}:${charge.amount_refunded}`,"refund",-(charge.amount_refunded-order.refunded)*10000,mode==='test'?"Refunded test credit":"Refunded calling credit");
        await client.query("UPDATE veilcall_billing_orders SET refunded_cents=$2 WHERE id=$1",[order.id,charge.amount_refunded]);
      }
      await client.query("UPDATE veilcall_billing_accounts SET blocked=true,updated_at=now() WHERE id=$1",[account.id]);
    } else if(event.type.startsWith("charge.dispute.")) {
      // Keep a disputed account paused until a human resolves it. A delayed
      // payment event or a closed-dispute event must not silently unpause it.
      await client.query("UPDATE veilcall_billing_accounts SET blocked=true,updated_at=now() WHERE id=$1",[account.id]);
    }
  });
}

export function webhookEvent(body:string,signature:string):Stripe.Event {
  const {webhookSecret}=requireBillingEnvironment();
  try {const event=stripeService().webhooks.constructEvent(body,signature,webhookSecret);assertBillingObject(event);return event;}
  catch(error){if(error instanceof BillingError)throw error;throw new BillingError("Invalid payment signature.",400);}
}
