import {numberOperator,numberBody} from '@/lib/number-access';
import {billingApiError} from '@/lib/billing-auth';
import {BillingError} from '@/lib/billing-config';
import {pilotAdminView,activatePilot} from '@/lib/pilot-service';
import {stagePilotOffer,changePilotState} from '@/lib/pilot-store';
import {pilotOfferInput} from '@/lib/pilot-values';
import {voiceJson} from '@/lib/voice-responses';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(){
  const owner=await numberOperator(undefined,true);if(owner instanceof Response)return owner;
  try{return voiceJson(await pilotAdminView());}catch(error){return billingApiError(error);}
}
export async function POST(request:Request){
  const owner=await numberOperator(request,true);if(owner instanceof Response)return owner;
  try{
    const body=await numberBody(request) as Record<string,unknown>|null;
    if(!body||Array.isArray(body)||Object.keys(body).some(key=>!['action','revision','config','confirmation'].includes(key))||!Number.isSafeInteger(body.revision)||Number(body.revision)<0)throw new BillingError('Refresh the pilot setup and try again.');
    const revision=Number(body.revision);
    if(body.action==='stage')await stagePilotOffer(owner.userId,revision,pilotOfferInput(body.config));
    else if(body.action==='activate')await activatePilot(owner.userId,revision,body.confirmation);
    else if(body.action==='pause')await changePilotState(owner.userId,revision,'pause',null);
    else throw new BillingError('Choose a supported pilot action.');
    return voiceJson(await pilotAdminView());
  }catch(error){return billingApiError(error);}
}
