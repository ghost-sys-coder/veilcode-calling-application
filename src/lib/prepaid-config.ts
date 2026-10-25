import 'server-only';
import {BillingError,requireTestBilling} from '@/lib/billing-config';

// Use the existing explicitly approved isolated billing database. A local file
// can contain production DB settings even when Stripe selects test mode.
export function requirePrepaidTestEnvironment():void {
  requireTestBilling();
  let host='',database='';try{const url=new URL(process.env.DATABASE_URL??'');host=url.hostname.replace('-pooler','');database=url.pathname;}catch{}
  if(process.env.VERCEL_ENV==='production' || host!=='ep-noisy-waterfall-b9lcv5rb.c-7.eu-central-1.aws.neon.tech' || database!=='/veilcall' ||
    ['TWILIO_CALLING_ENABLED','VOICE_RECORDING_ENABLED','CALLBACK_EMAIL_ENABLED'].some(key=>process.env[key]==='true'))
    throw new BillingError('Prepaid dialing tests are available only in the isolated billing preview.',409);
}
