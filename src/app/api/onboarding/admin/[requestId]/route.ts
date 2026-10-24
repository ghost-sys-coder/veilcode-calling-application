import { numberApiError, numberBody, numberOperator } from "@/lib/number-access";
import { numberRequestIdPattern, validateNumberReview } from "@/lib/number-validation";
import { administerNumberRequest } from "@/lib/number-service";
import { voiceJson } from "@/lib/voice-responses";
export const runtime="nodejs";
export async function POST(request:Request,{params}:{params:Promise<{requestId:string}>}) {
  const operator=await numberOperator(request,true);if(operator instanceof Response)return operator;
  const {requestId}=await params;if(!numberRequestIdPattern.test(requestId))return voiceJson({error:"Invalid number request."},400);
  try {
    const input=validateNumberReview(await numberBody(request));
    if(!input)return voiceJson({error:"Choose an action and provide a reason for rejection or disabling a number. Assignment requires an international phone number."},400);
    await administerNumberRequest(requestId,operator.userId,input);return voiceJson({saved:true});
  } catch(error){return numberApiError(error);}
}
