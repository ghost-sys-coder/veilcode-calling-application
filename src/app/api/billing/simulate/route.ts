import { randomBytes } from "node:crypto";
import { billingOperator, billingBody, billingApiError } from "@/lib/billing-auth";
import { BillingError, requireTestBilling } from "@/lib/billing-config";
import { requireBillingEligibility } from "@/lib/billing-service";
import { testCallingRate } from "@/lib/billing-rates";
import { reserveBillingCall,consumeBillingReservation,settleBillingReservation } from "@/lib/billing-store";
import { operatorCallerIds } from "@/lib/operator-caller-ids";
import { voiceJson } from "@/lib/voice-responses";
export const runtime="nodejs";
export async function POST(request:Request){
  const operator=await billingOperator(request);if(operator instanceof Response)return operator;
  try{
    requireTestBilling();await requireBillingEligibility(operator.userId);
    const body=await billingBody(request) as Record<string,unknown>|null;
    if(body?.consent!==true || typeof body.to!=="string" || typeof body.from!=="string" || typeof body.seconds!=="number" ||
      !Number.isInteger(body.seconds) || body.seconds<0 || body.seconds>300 ||
      !(await operatorCallerIds(operator.userId)).some(item=>item.number===body.from))throw new BillingError("Choose your calling number, a test destination and a duration up to five minutes.");
    const rate=testCallingRate(body.to,body.from);
    if(body.rateMicro!==rate.rateMicro || body.feeMicro!==rate.feeMicro)throw new BillingError("Preview and accept the current test rate before simulating usage.",409);
    const reservation=await reserveBillingCall(operator.userId,"test",body.to,body.from,rate);
    const seconds=Math.min(body.seconds,reservation.maxSeconds);
    const callSid=`CA${randomBytes(16).toString("hex")}`;
    await consumeBillingReservation(reservation.id,operator.userId,body.to,body.from,callSid);
    await settleBillingReservation(reservation.id,callSid,seconds,null,{simulation:true});
    return voiceJson({simulated:true,maxSeconds:reservation.maxSeconds,seconds});
  }catch(error){return billingApiError(error);}
}
