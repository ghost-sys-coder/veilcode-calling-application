import { numberApiError, numberBody, numberOperator } from "@/lib/number-access";
import { numberRequestIdPattern } from "@/lib/number-validation";
import { startNumberVerification } from "@/lib/number-service";
import { voiceJson } from "@/lib/voice-responses";
export const runtime="nodejs";
export async function POST(request:Request,{params}:{params:Promise<{requestId:string}>}) {
  const operator=await numberOperator(request);if(operator instanceof Response)return operator;
  const {requestId}=await params;
  if(!numberRequestIdPattern.test(requestId))return voiceJson({error:"Invalid number request."},400);
  try {
    const body=await numberBody(request);
    if(!body || typeof body!=="object" || (body as {consent?:unknown}).consent!==true)return voiceJson({error:"Confirm that you control this number and agree to receive a verification call."},400);
    return voiceJson(await startNumberVerification(requestId,operator.userId));
  } catch(error){return numberApiError(error);}
}
