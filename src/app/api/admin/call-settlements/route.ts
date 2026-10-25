import {numberOperator,numberBody,numberApiError} from '@/lib/number-access';
import {settlementReport,recheckSettlement,settlementRecheckInput} from '@/lib/settlement-review-store';
import {BillingError} from '@/lib/billing-config';
import {reconcileTwilioSettlements} from '@/lib/twilio-settlement-service';
import {voiceJson} from '@/lib/voice-responses';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET() {
  const owner=await numberOperator(undefined,true);if(owner instanceof Response)return owner;
  try{return voiceJson(await settlementReport());}
  catch{return voiceJson({error:'Settlement status is temporarily unavailable.'},503);}
}
export async function POST(request:Request) {
  const owner=await numberOperator(request,true);if(owner instanceof Response)return owner;
  // No browser-supplied reservation, amount, duration or provider identity.
  try{
    if(request.headers.get('content-type')?.startsWith('application/json')){
      let body:unknown;try{body=await numberBody(request);}catch(error){return numberApiError(error);}
      const input=settlementRecheckInput(body);
      const parent=await recheckSettlement(owner.userId,input);
      const result=await reconcileTwilioSettlements(parent);
      return voiceJson({...result,status:await settlementReport()});
    }
    // A bodyless network POST can still expose an empty ReadableStream. Reject
    // the first actual byte, without buffering an arbitrary request body.
    const reader=request.body?.getReader();
    if(reader)try{
      for(;;){const {done,value}=await reader.read();if(done)break;
        if(value.byteLength){await reader.cancel();return voiceJson({error:'This action does not accept call data.'},400);}
      }
    }finally{reader.releaseLock();}
    return voiceJson({...await reconcileTwilioSettlements(),status:await settlementReport()});
  }
  catch(error){if(error instanceof BillingError)return voiceJson({error:error.message},error.status);return voiceJson({error:'Calls could not be checked. Refresh and try again shortly.'},503);}
}
