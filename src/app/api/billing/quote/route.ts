import { billingOperator, billingBody, billingApiError } from "@/lib/billing-auth";
import { BillingError, requireTestBilling } from "@/lib/billing-config";
import { requireBillingEligibility } from "@/lib/billing-service";
import { testCallingRate, reservationAmounts } from "@/lib/billing-rates";
import { getBillingAccount } from "@/lib/billing-store";
import { operatorCallerIds } from "@/lib/operator-caller-ids";
import { voiceJson } from "@/lib/voice-responses";
export const runtime="nodejs";
export async function POST(request:Request){
  const operator=await billingOperator(request);if(operator instanceof Response)return operator;
  try{
    requireTestBilling();await requireBillingEligibility(operator.userId);
    const body=await billingBody(request) as Record<string,unknown>|null;
    if(typeof body?.to!=="string" || typeof body.from!=="string" || !(await operatorCallerIds(operator.userId)).some(item=>item.number===body.from))
      throw new BillingError("Select one of your own calling numbers.",403);
    const rate=testCallingRate(body.to,body.from),account=await getBillingAccount(operator.userId,"test");
    const available=Math.max(0,account.balanceMicro-account.heldMicro);
    let maxSeconds=0;try{maxSeconds=reservationAmounts(available,rate).maxSeconds;}catch{/* Quote is useful before funding too. */}
    return voiceJson({...rate,maxSeconds,to:body.to,from:body.from});
  }catch(error){return billingApiError(error);}
}
