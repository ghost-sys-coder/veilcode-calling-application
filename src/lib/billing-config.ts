import "server-only";
import { getStripeMode } from "@/lib/stripe-config";

export class BillingError extends Error {
  constructor(message:string,public status=400){super(message);this.name="BillingError";}
}
// This switch is necessary but insufficient: a complete immutable offer must
// also be explicitly activated by the owner in Postgres. Default stays closed.
export function liveBillingEnabled():boolean {
  return getStripeMode()==='live' && process.env.VEILCALL_LIVE_BILLING_ENABLED==='true';
}
export function billingEnabled():boolean {
  return getStripeMode()==="test" && process.env.VEILCALL_BILLING_TEST_ENABLED==="true";
}
export function requireTestBilling() {
  if(!billingEnabled())throw new BillingError("Payments are not available yet. Your existing calling access is unchanged.",409);
  const priceId=process.env.STRIPE_TEST_MONTHLY_PRICE_ID?.trim();
  const webhookSecret=process.env.STRIPE_TEST_WEBHOOK_SECRET?.trim();
  if(!priceId?.startsWith("price_") || !webhookSecret?.startsWith("whsec_"))throw new BillingError("Test billing setup is incomplete.",503);
  return {mode:"test" as const,priceId,webhookSecret,monthlyCents:1900,topups:[1000,2500,5000]};
}
// Webhooks and the portal remain available when new purchases are paused.
export function requireBillingEnvironment() {
  if(getStripeMode()==='test')return requireTestBilling();
  const webhookSecret=process.env.STRIPE_PROD_WEBHOOK_SECRET?.trim();
  if(!webhookSecret?.startsWith('whsec_'))throw new BillingError('Live billing setup is incomplete.',503);
  return {mode:'live' as const,webhookSecret};
}
export function billingOrigin():string {
  const origin=new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "");
  if(origin.username || origin.password || origin.pathname!=="/" || origin.search || origin.hash ||
    (origin.protocol!=="https:" && !(origin.protocol==="http:" && ["localhost","127.0.0.1"].includes(origin.hostname))))
    throw new BillingError("Billing return address is not configured.",503);
  return origin.origin;
}
