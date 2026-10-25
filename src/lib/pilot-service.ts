import 'server-only';
import {BillingError,liveBillingEnabled,billingOrigin} from '@/lib/billing-config';
import {pilotControl,changePilotState} from '@/lib/pilot-store';
import {pilotOfferIssues} from '@/lib/pilot-values';
import {stripeService} from '@/lib/stripe';
import {operatorCallerIds} from '@/lib/operator-caller-ids';
import {operatorHasAccess} from '@/lib/access';
import type {PilotRelease,PilotAdminView} from '@/lib/pilot-types';
import {getVoiceConfig} from '@/lib/voice-config';
import {voiceService} from '@/lib/voice-service';
import {retentionDays} from '@/lib/review-validation';
import {policyDocuments} from '@/lib/legal-policies';

export async function requirePilotRelease():Promise<PilotRelease>{
  if(!liveBillingEnabled())throw new BillingError('Paid calling and live payments are not open yet.',402);
  const control=await pilotControl();
  if(control.paused||!control.active||control.active.providerAccountSid!==process.env.TWILIO_ACCOUNT_SID?.trim()||pilotOfferIssues(control.active.config).length)throw new BillingError('The paid pilot is paused. Contact the owner.',409);
  return control.active;
}
export async function requirePilotCustomer(operatorId:string):Promise<PilotRelease>{
  if(!await operatorHasAccess(operatorId))throw new BillingError('Your account must be approved first.',403);
  const release=await requirePilotRelease();
  const callers=await operatorCallerIds(operatorId);
  if(!callers.some(caller=>Object.keys(release.config.rates[caller.number]??{}).length))throw new BillingError('An approved calling number and a published UK/Australia rate are required before payment.',409);
  return release;
}
export async function pilotAdminView():Promise<PilotAdminView>{
  const control=await pilotControl();
  const issues=control.draft ? pilotOfferIssues(control.draft.config) : ['Save the pilot offer before activating.'];
  if(!liveBillingEnabled())issues.push('Live commerce release switch is closed.');
  if(!process.env.STRIPE_PROD_WEBHOOK_SECRET?.startsWith('whsec_'))issues.push('Configure the live Stripe webhook signing secret.');
  if(control.draft&&control.draft.providerAccountSid!==process.env.TWILIO_ACCOUNT_SID?.trim())issues.push('Restage this offer for the current calling provider account.');
  if(control.draft&&policyDocuments.some(document=>control.draft!.config.policies[document.key]!==`${billingOrigin()}/legal/${document.key}`))issues.push('Use this deployment’s VeilCall policy URLs so the accepted offer retains its exact policy snapshot.');
  return {...control,releaseEnabled:liveBillingEnabled(),issues};
}
export async function verifyPilotStripe(release:PilotRelease):Promise<void>{
  const voice=getVoiceConfig();
  if(voice.accountSid!==release.providerAccountSid||retentionDays()!==30)throw new BillingError('Calling configuration and 30-day recording retention must match this offer.',409);
  const stripe=stripeService(),offer=release.config;
  const [account,price,portal,endpoints]=await Promise.all([
    stripe.accounts.retrieveCurrent(),stripe.prices.retrieve(offer.priceId),
    stripe.billingPortal.configurations.retrieve(process.env.STRIPE_PROD_PORTAL_CONFIGURATION_ID??''),
    stripe.webhookEndpoints.list({limit:100}),
  ]);
  if(!account.charges_enabled||!account.payouts_enabled)throw new BillingError('Stripe payments and payouts must be enabled for this business.',409);
  if(!price.livemode||!price.active||price.currency!=='usd'||price.unit_amount!==offer.monthlyCents||price.type!=='recurring'||price.recurring?.interval!=='month'||price.recurring.interval_count!==1||price.billing_scheme!=='per_unit'||price.tax_behavior==='exclusive')
    throw new BillingError('The live monthly Stripe Price must match the approved USD offer, with tax included or reviewed as not charged.',409);
  if(!portal.active||!portal.livemode||!portal.features.subscription_cancel.enabled||portal.features.subscription_update.enabled)throw new BillingError('Configure an active live portal with cancellation and without unapproved plan changes.',409);
  const required=['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed','charge.refunded','charge.dispute.created','charge.dispute.closed'];
  if(!endpoints.data.some(endpoint=>endpoint.status==='enabled'&&endpoint.livemode&&endpoint.url===`${billingOrigin()}/api/billing/webhook`&&(endpoint.enabled_events.includes('*')||required.every(event=>endpoint.enabled_events.includes(event as never)))))throw new BillingError('Configure the signed live webhook with every required billing event.',409);
  const provider=voiceService(),numbers=Object.keys(offer.rates);
  for(let offset=0;offset<numbers.length;offset+=3)await Promise.all(numbers.slice(offset,offset+3).map(async number=>{
    const [owned,verified]=await Promise.all([provider.incomingPhoneNumbers.list({phoneNumber:number,limit:1}),provider.outgoingCallerIds.list({phoneNumber:number,limit:1})]);
    if(![...owned,...verified].some(caller=>caller.phoneNumber===number&&caller.accountSid===voice.accountSid))throw new BillingError('Every priced outgoing number must still be owned or verified in the calling account.',409);
  }));
}
export async function activatePilot(actorId:string,revision:number,confirmation:unknown):Promise<void>{
  if(confirmation!=='OPEN PAID PILOT')throw new BillingError('Confirm the paid-pilot release explicitly.');
  const view=await pilotAdminView();
  if(view.revision!==revision||!view.draft)throw new BillingError('Pilot setup changed. Refresh before continuing.',409);
  if(view.issues.length)throw new BillingError(view.issues.join(' '),409);
  await verifyPilotStripe(view.draft);
  await changePilotState(actorId,revision,'activate',view.draft.id);
}
