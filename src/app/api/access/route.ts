import { billingOperator, billingApiError } from "@/lib/billing-auth";
import { getOperatorAccess, requestOperatorAccess } from "@/lib/customer-access";
import { isApprovedOperator } from "@/lib/access";
import { voiceJson } from "@/lib/voice-responses";
export const runtime="nodejs";
export async function GET(){
  const operator=await billingOperator();if(operator instanceof Response)return operator;
  try{return voiceJson({legacy:isApprovedOperator(operator.userId),access:await getOperatorAccess(operator.userId)});}
  catch(error){return billingApiError(error);}
}
export async function POST(request:Request){
  const operator=await billingOperator(request);if(operator instanceof Response)return operator;
  try{await requestOperatorAccess(operator.userId);return voiceJson({submitted:true});}
  catch(error){return billingApiError(error);}
}
