import "server-only";
import { getStripeMode } from "@/lib/stripe-config";

export class BillingError extends Error {
  constructor(message:string,public status=400){super(message);this.name="BillingError";}
}
// Deliberate release boundary: no environment variable can enable live payments
// or make test credit eligible for a paid Twilio call in this release.
export function liveBillingEnabled():boolean {return false;}
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
export function billingOrigin():string {
  const origin=new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "");
  if(origin.username || origin.password || origin.pathname!=="/" || origin.search || origin.hash ||
    (origin.protocol!=="https:" && !(origin.protocol==="http:" && ["localhost","127.0.0.1"].includes(origin.hostname))))
    throw new BillingError("Billing return address is not configured.",503);
  return origin.origin;
}
