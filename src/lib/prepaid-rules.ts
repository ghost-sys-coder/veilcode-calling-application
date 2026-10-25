import 'server-only';
import twilio from 'twilio';
import {BillingError} from '@/lib/billing-config';
import {prepaidScenarios,type PrepaidScenario,type TestCallProof} from '@/lib/prepaid-types';
import type {CallReservation} from '@/lib/billing-types';

export const testProviderAccount='AC'+'0'.repeat(32);
export function prepaidRunInput(scenario:unknown,seconds:unknown):{scenario:PrepaidScenario;seconds:number} {
  if(!prepaidScenarios.some(item=>item.value===scenario) || typeof seconds!=='number' || !Number.isInteger(seconds) || seconds<0 || seconds>3600)
    throw new BillingError('Choose a test outcome and a whole number of seconds from 0 to 3600.');
  if(scenario!=='completed' && seconds!==0)throw new BillingError('Unanswered attempts must have zero connected seconds.');
  return {scenario:scenario as PrepaidScenario,seconds};
}
export function prepaidDialTwiML(reservation:Pick<CallReservation,'from'|'to'|'maxSeconds'>):string {
  if(!Number.isInteger(reservation.maxSeconds) || reservation.maxSeconds<60 || reservation.maxSeconds>300 ||
    !/^\+[1-9]\d{7,14}$/.test(reservation.to) || !/^\+[1-9]\d{7,14}$/.test(reservation.from))throw new BillingError('The reserved call limit is invalid.');
  const response=new twilio.twiml.VoiceResponse();
  response.dial({callerId:reservation.from,answerOnBridge:true,timeout:30,timeLimit:reservation.maxSeconds,record:'do-not-record'}).number(reservation.to);
  response.hangup();
  return response.toString();
}
// The adapter supplies canonical provider records; browser durations and webhook
// form values are never sufficient evidence to settle a prepaid reservation.
export function prepaidProofSeconds(reservation:CallReservation,proof:TestCallProof):number {
  const parent=proof?.parent,child=proof?.child;
  if(reservation.mode!=='test' || proof?.source!=='prepaid-test' || proof.accountSid!==testProviderAccount ||
    !parent || !child || parent.sid!==reservation.callSid || parent.from!==`client:${reservation.operatorId}` ||
    !/^CA[0-9a-f]{32}$/.test(parent.sid) || !/^CA[0-9a-f]{32}$/.test(child.sid) || child.sid===parent.sid ||
    child.parentSid!==parent.sid || child.to!==reservation.to || child.from!==reservation.from)
    throw new BillingError('The provider result does not match the reserved call.',403);
  if(!['completed','failed','busy','no-answer','canceled'].includes(parent.status) || !prepaidScenarios.some(item=>item.value===child.status))
    throw new BillingError('Both call legs must be finished before settlement.',409);
  if(!Number.isInteger(parent.duration) || parent.duration<0 || parent.duration>86400 ||
    !Number.isInteger(child.duration) || child.duration<0 || child.duration>86400 || child.duration>parent.duration ||
    (child.status!=='completed' && child.duration!==0))throw new BillingError('The provider call duration needs review.',409);
  return child.duration;
}
