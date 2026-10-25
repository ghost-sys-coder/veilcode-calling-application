import 'server-only';
import {voiceService} from '@/lib/voice-service';
import {realTwilioAccount,SettlementEvidenceError,twilioSettlementSeconds,type TwilioCallRecord} from '@/lib/twilio-settlement-proof';
import type {CallReservation} from '@/lib/billing-types';

function snapshot(record:TwilioCallRecord):TwilioCallRecord {
  return {sid:record.sid,accountSid:record.accountSid,parentCallSid:record.parentCallSid,from:record.from,to:record.to,
    direction:record.direction,status:record.status,duration:record.duration};
}
export async function fetchTwilioSettlement(reservation:CallReservation,accountSid:string) {
  // Reject a test wallet or a changed provider account before any network access.
  if(reservation.mode!=='live' || !realTwilioAccount(accountSid) || accountSid!==process.env.TWILIO_ACCOUNT_SID?.trim() ||
    !/^CA[0-9a-f]{32}$/.test(reservation.callSid??''))throw new SettlementEvidenceError('provider-mismatch',true);
  try {
    const client=voiceService(),parent=await client.calls(reservation.callSid!).fetch();
    if(parent.sid!==reservation.callSid || parent.accountSid!==accountSid || parent.parentCallSid ||
      parent.from!==`client:${reservation.operatorId}` || parent.direction!=='inbound')throw new SettlementEvidenceError('provider-mismatch',true);
    // Fetch two to detect multiple legs; never select a convenient match or assume
    // a missing/not-yet-visible child means a free or unanswered call.
    const children=await client.calls.list({parentCallSid:parent.sid,limit:2});
    if(!children.length)throw new SettlementEvidenceError('provider-pending');
    if(children.length!==1)throw new SettlementEvidenceError('provider-mismatch',true);
    const proof={source:'twilio-api' as const,accountSid,parent:snapshot(parent),child:snapshot(children[0])};
    return {seconds:twilioSettlementSeconds(reservation,accountSid,proof),proof};
  } catch(error) {
    if(error instanceof SettlementEvidenceError)throw error;
    // Do not retain raw SDK errors: they can contain URLs, numbers or credentials.
    throw new SettlementEvidenceError('provider-unavailable');
  }
}
