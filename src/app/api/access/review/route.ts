import { billingOperator, billingBody, billingApiError } from "@/lib/billing-auth";
import { listAccessCustomers, reviewOperatorAccess } from "@/lib/customer-access";
import { voiceJson } from "@/lib/voice-responses";
export const runtime="nodejs";
export async function GET(){
  const operator=await billingOperator(undefined,true);if(operator instanceof Response)return operator;
  try{return voiceJson({customers:await listAccessCustomers()});}catch(error){return billingApiError(error);}
}
export async function POST(request:Request){
  const operator=await billingOperator(request,true);if(operator instanceof Response)return operator;
  try{
    const body=await billingBody(request) as Record<string,unknown>|null;
    if(!body || typeof body.operatorId!=="string" || !/^user_[A-Za-z0-9]+$/.test(body.operatorId) ||
      !["approved","rejected","suspended"].includes(String(body.status)) || typeof body.status!=="string" ||
      !Number.isSafeInteger(body.revision) || Number(body.revision)<1 || typeof body.note!=="string" ||
      body.note.length>1200 || /[\u0000-\u001f]/.test(body.note) || (body.status!=="approved" && !body.note.trim()))
      return voiceJson({error:"Choose a valid review action and include a reason for rejection or suspension."},400);
    await reviewOperatorAccess(body.operatorId,operator.userId,body.status,Number(body.revision),body.note.trim());
    return voiceJson({saved:true});
  }catch(error){return billingApiError(error);}
}
