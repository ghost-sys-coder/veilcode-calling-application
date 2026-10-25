import 'server-only';
import type {CallReservation} from '@/lib/billing-types';

export type SettlementReason='provider-unavailable'|'provider-pending'|'provider-mismatch'|'duration-invalid'|'attempts-exhausted';
export class SettlementEvidenceError extends Error {
  constructor(public reason:SettlementReason,public review=false){super('Provider settlement evidence is not ready.');}
}
export interface TwilioCallRecord {
  sid:string;accountSid:string;parentCallSid:string|null;from:string;to:string;
  direction:string;status:string;duration:unknown;
}
export interface TwilioSettlementProof {
  source:'twilio-api';accountSid:string;
  parent:TwilioCallRecord;child:TwilioCallRecord;
}
const sid=/^CA[0-9a-f]{32}$/;
export function realTwilioAccount(accountSid:string):boolean {
  return /^AC[0-9a-f]{32}$/.test(accountSid) && accountSid!=='AC'+'0'.repeat(32);
}
function duration(value:unknown):number {
  // Null/empty values are unavailable, never evidence of a zero-second call.
  if(typeof value!=='string' || !/^\d{1,6}$/.test(value))throw new SettlementEvidenceError('provider-pending');
  const seconds=Number(value);
  if(seconds>86400)throw new SettlementEvidenceError('duration-invalid',true);
  return seconds;
}
export function twilioSettlementSeconds(reservation:CallReservation,accountSid:string,proof:TwilioSettlementProof):number {
  const parent=proof?.parent,child=proof?.child;
  if(reservation.mode!=='live' || !realTwilioAccount(accountSid) || proof?.source!=='twilio-api' || proof.accountSid!==accountSid ||
    !parent || !child || parent.accountSid!==accountSid || child.accountSid!==accountSid ||
    !sid.test(parent.sid) || !sid.test(child.sid) || parent.sid!==reservation.callSid || parent.sid===child.sid ||
    parent.parentCallSid!==null || parent.from!==`client:${reservation.operatorId}` || parent.direction!=='inbound' ||
    child.parentCallSid!==parent.sid || child.direction!=='outbound-dial' || child.to!==reservation.to || child.from!==reservation.from)
    throw new SettlementEvidenceError('provider-mismatch',true);
  const terminal=['completed','busy','failed','no-answer','canceled'];
  if(!terminal.includes(parent.status) || !terminal.includes(child.status))throw new SettlementEvidenceError('provider-pending');
  const parentSeconds=duration(parent.duration),childSeconds=duration(child.duration);
  if(childSeconds>parentSeconds || (child.status!=='completed' && childSeconds!==0) ||
    (parent.status!=='completed' && childSeconds>0))throw new SettlementEvidenceError('duration-invalid',true);
  return childSeconds;
}
