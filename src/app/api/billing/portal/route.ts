import { billingOperator, billingApiError } from "@/lib/billing-auth";
import { openBillingPortal } from "@/lib/billing-service";
import { voiceJson } from "@/lib/voice-responses";
export const runtime="nodejs";
export async function POST(request:Request){
  const operator=await billingOperator(request);if(operator instanceof Response)return operator;
  try{return voiceJson({url:await openBillingPortal(operator.userId)});}catch(error){return billingApiError(error);}
}
