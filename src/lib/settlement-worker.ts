import 'server-only';
import {reconcileTwilioSettlements} from '@/lib/twilio-settlement-service';
import {recordSettlementWorker} from '@/lib/settlement-review-store';
import {twilioSettlementStatus} from '@/lib/twilio-settlement-store';
// This worker only consumes previously bound jobs. No call admission, email,
// recording, customer creation or live-payment operation is imported here.
export async function runSettlementWorker() {
  try{
    const result=await reconcileTwilioSettlements();
    const status=await twilioSettlementStatus();
    await recordSettlementWorker(true);
    return {...result,status};
  }catch(error){await recordSettlementWorker(false).catch(()=>{});throw error;}
}
