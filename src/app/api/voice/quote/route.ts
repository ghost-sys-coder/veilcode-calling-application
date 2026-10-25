import {billingOperator,billingBody,billingApiError} from '@/lib/billing-auth';
import {BillingError} from '@/lib/billing-config';
import {requireRealCallingAccess} from '@/lib/billing-call-access';
import {createLiveQuote,liveCallState} from '@/lib/live-calling-store';
import {voiceJson} from '@/lib/voice-responses';
export const runtime='nodejs';
export async function GET(){
  const operator=await billingOperator();if(operator instanceof Response)return operator;
  try{await requireRealCallingAccess(operator.userId);return voiceJson({session:await liveCallState(operator.userId)});}catch(error){return billingApiError(error);}
}
export async function POST(request:Request){
  const operator=await billingOperator(request);if(operator instanceof Response)return operator;
  try{
    await requireRealCallingAccess(operator.userId);
    const body=await billingBody(request) as Record<string,unknown>|null;
    if(!body||Object.keys(body).some(key=>!['to','from'].includes(key))||typeof body.to!=='string'||typeof body.from!=='string')throw new BillingError('Choose a calling number and recipient.');
    return voiceJson(await createLiveQuote(operator.userId,body.to,body.from));
  }catch(error){return billingApiError(error);}
}
