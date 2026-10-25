import {numberOperator} from '@/lib/number-access';
import {twilioSettlementStatus} from '@/lib/twilio-settlement-store';
import {reconcileTwilioSettlements} from '@/lib/twilio-settlement-service';
import {voiceJson} from '@/lib/voice-responses';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET() {
  const owner=await numberOperator(undefined,true);if(owner instanceof Response)return owner;
  try{return voiceJson(await twilioSettlementStatus());}
  catch{return voiceJson({error:'Settlement status is temporarily unavailable.'},503);}
}
export async function POST(request:Request) {
  const owner=await numberOperator(request,true);if(owner instanceof Response)return owner;
  // No browser-supplied reservation, amount, duration or provider identity.
  try{
    // A bodyless network POST can still expose an empty ReadableStream. Reject
    // the first actual byte, without buffering an arbitrary request body.
    const reader=request.body?.getReader();
    if(reader)try{
      for(;;){const {done,value}=await reader.read();if(done)break;
        if(value.byteLength){await reader.cancel();return voiceJson({error:'This action does not accept call data.'},400);}
      }
    }finally{reader.releaseLock();}
    return voiceJson({...await reconcileTwilioSettlements(),status:await twilioSettlementStatus()});
  }
  catch{return voiceJson({error:'Calls could not be fully reconciled. Try again shortly.'},503);}
}
