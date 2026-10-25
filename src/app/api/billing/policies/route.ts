import {billingOperator,billingBody,billingApiError} from '@/lib/billing-auth';
import {BillingError} from '@/lib/billing-config';
import {requirePilotCustomer} from '@/lib/pilot-service';
import {acceptPolicies} from '@/lib/pilot-store';
import {voiceJson} from '@/lib/voice-responses';
export const runtime='nodejs';
export async function POST(request:Request){
  const operator=await billingOperator(request);if(operator instanceof Response)return operator;
  try{
    const body=await billingBody(request) as Record<string,unknown>|null;
    if(!body||Object.keys(body).some(key=>!['offerId','accepted','immediate'].includes(key))||body.accepted!==true||typeof body.immediate!=='boolean')throw new BillingError('Review and accept the current service policies.');
    const release=await requirePilotCustomer(operator.userId);
    if(body.offerId!==release.id)throw new BillingError('The offer changed. Refresh and review the new agreement.',409);
    await acceptPolicies(operator.userId,release.id,body.immediate);return voiceJson({accepted:true});
  }catch(error){return billingApiError(error);}
}
