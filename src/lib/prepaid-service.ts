import 'server-only';
import {BillingError} from '@/lib/billing-config';
import {requirePrepaidTestEnvironment} from '@/lib/prepaid-config';
import {requireBillingEligibility} from '@/lib/billing-service';
import {operatorCallerIds} from '@/lib/operator-caller-ids';
import {testCallingRate} from '@/lib/billing-rates';
import {settleBillingReservation} from '@/lib/billing-store';
import {createPrepaidQuote,getPrepaidQuote,reservePrepaidQuote,ownedPrepaidReservation,activatePrepaidTest,cancelPrepaidTest,
  completeTestProviderRun,recoverablePrepaidReservation,readPrepaidState,subscriptionReady} from '@/lib/prepaid-store';
import {prepaidProofSeconds,prepaidRunInput} from '@/lib/prepaid-rules';
import type {PrepaidQuote,PrepaidView} from '@/lib/prepaid-types';

export async function requirePrepaidOperator(operatorId:string):Promise<void> {
  requirePrepaidTestEnvironment();await requireBillingEligibility(operatorId);
}
async function requireCaller(operatorId:string,from:string):Promise<void> {
  if(!(await operatorCallerIds(operatorId)).some(caller=>caller.number===from))throw new BillingError('Select one of your own active calling numbers.',403);
}
export async function prepaidView(operatorId:string):Promise<PrepaidView> {
  const [{account,session},callers]=await Promise.all([readPrepaidState(operatorId),operatorCallerIds(operatorId)]);
  return {availableMicro:Math.max(0,account.balanceMicro-account.heldMicro),heldMicro:account.heldMicro,balanceMicro:account.balanceMicro,
    blocked:account.blocked,subscriptionReady:subscriptionReady(account),session,callers};
}
export async function previewPrepaidRate(operatorId:string,to:string,from:string):Promise<PrepaidQuote> {
  await requireCaller(operatorId,from);
  const quote=await createPrepaidQuote(operatorId,to,from,testCallingRate(to,from));
  return {id:quote.id,to:quote.to,from:quote.from,route:quote.route,rateMicro:quote.rateMicro,feeMicro:quote.feeMicro,
    maxSeconds:quote.maxSeconds,heldMicro:quote.heldMicro,expiresAt:new Date(quote.expiresAt).toISOString()};
}
export async function acceptPrepaidRate(operatorId:string,quoteId:string,consent:unknown):Promise<void> {
  if(consent!==true)throw new BillingError('Accept the displayed rate and maximum test charge before reserving credit.');
  const quote=await getPrepaidQuote(operatorId,quoteId);if(!quote)throw new BillingError('Rate quote not found.',404);
  await requireCaller(operatorId,quote.from);await reservePrepaidQuote(operatorId,quoteId);
}
export async function startPrepaidRun(operatorId:string,id:string,scenario:unknown,seconds:unknown):Promise<void> {
  const input=prepaidRunInput(scenario,seconds),reservation=await ownedPrepaidReservation(operatorId,id);
  if(!reservation)throw new BillingError('Test call not found.',404);
  await requireCaller(operatorId,reservation.from);
  await activatePrepaidTest(operatorId,id,input.scenario,input.seconds);
}
export async function settlePrepaidRun(operatorId:string,id:string,fastForward:boolean):Promise<void> {
  const reservation=await ownedPrepaidReservation(operatorId,id);if(!reservation)throw new BillingError('Test call not found.',404);
  const proof=await completeTestProviderRun(operatorId,id,fastForward);if(!proof)return;
  const seconds=prepaidProofSeconds(reservation,proof);
  await settleBillingReservation(reservation.id,proof.parent.sid,seconds,proof.child.sid,{...proof,simulation:true});
}
export async function recoverPrepaidRun(operatorId:string):Promise<void> {
  const id=await recoverablePrepaidReservation(operatorId);if(id)await settlePrepaidRun(operatorId,id,false);
}
export {cancelPrepaidTest};
