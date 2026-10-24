import { billingOperator, billingBody, billingApiError } from "@/lib/billing-auth";
import { startBillingCheckout } from "@/lib/billing-service";
import { voiceJson } from "@/lib/voice-responses";
export const runtime="nodejs";
export async function POST(request:Request){
  const operator=await billingOperator(request);if(operator instanceof Response)return operator;
  try{const body=await billingBody(request) as Record<string,unknown>|null;
    return voiceJson({url:await startBillingCheckout(operator.userId,body?.kind,body?.amountCents)});
  }catch(error){return billingApiError(error);}
}
