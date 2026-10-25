import 'server-only';
import twilio from 'twilio';
import {BillingError,liveBillingEnabled} from '@/lib/billing-config';
import {operatorCallerIds} from '@/lib/operator-caller-ids';
import {voiceWebhookUrl} from '@/lib/voice-service';
import {settleBillingReservation} from '@/lib/billing-store';
import {prepaidDialTwiML} from '@/lib/prepaid-rules';
import {fetchTwilioSettlement} from '@/lib/twilio-settlement-provider';
import {SettlementEvidenceError} from '@/lib/twilio-settlement-proof';
import {bindTwilioReservation,claimTwilioSettlements,finishTwilioSettlement,deferTwilioSettlement,type TwilioSettlementJob} from '@/lib/twilio-settlement-store';

// Signed TwiML admission consumes a live-only persisted permit. The release
// switch alone cannot grant access without the activated offer and paid account.
export async function preparePrepaidTwilioCall(id:string,operatorId:string,to:string,from:string,parentSid:string):Promise<string> {
  if(!liveBillingEnabled())throw new BillingError('Paid calling is not available yet.',402);
  if(!(await operatorCallerIds(operatorId)).some(caller=>caller.number===from))throw new BillingError('Select one of your own active calling numbers.',403);
  const accountSid=process.env.TWILIO_ACCOUNT_SID?.trim()??'';
  const callback=voiceWebhookUrl('/api/voice/prepaid/callback');
  const reservation=await bindTwilioReservation(id,operatorId,to,from,parentSid,accountSid);
  // Reuse the tested limits. The action response hangs up the browser leg; both
  // action and child terminal events can wake the durable reconciliation job.
  const response=new twilio.twiml.VoiceResponse();
  // Validate the same immutable reservation fields as the deterministic provider.
  prepaidDialTwiML(reservation);
  response.dial({callerId:reservation.from,answerOnBridge:true,timeout:30,timeLimit:reservation.maxSeconds,
    record:'do-not-record',action:callback,method:'POST'}).number({statusCallback:callback,statusCallbackMethod:'POST',statusCallbackEvent:['completed']},reservation.to);
  response.hangup();return response.toString();
}
async function reconcile(job:TwilioSettlementJob):Promise<boolean> {
  try {
    // A previous invocation may have committed the ledger before losing its reply.
    if(job.reservation.status!=='settled'){
      const {seconds,proof}=await fetchTwilioSettlement(job.reservation,job.accountSid);
      await settleBillingReservation(job.reservation.id,proof.parent.sid,seconds,proof.child.sid,{...proof,simulation:false});
    }
    await finishTwilioSettlement(job);return true;
  }catch(error){
    const evidence=error instanceof SettlementEvidenceError ? error : new SettlementEvidenceError('provider-unavailable');
    await deferTwilioSettlement(job,evidence.reason,evidence.review);return false;
  }
}
// Settlement must remain available when new calling is paused: an already active
// live call still owns a hold. This function never admits or creates a call.
export async function reconcileTwilioSettlements(parentSid?:string) {
  const jobs=await claimTwilioSettlements(parentSid),results=await Promise.allSettled(jobs.map(reconcile));
  if(results.some(result=>result.status==='rejected'))throw new Error('Settlement recovery storage is temporarily unavailable.');
  return {processed:jobs.length,settled:results.filter(result=>result.status==='fulfilled'&&result.value).length,
    pending:results.filter(result=>result.status==='rejected'||!result.value).length};
}
