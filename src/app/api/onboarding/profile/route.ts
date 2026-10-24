import { numberApiError, numberBody, numberOperator } from "@/lib/number-access";
import { saveBusinessProfile } from "@/lib/number-store";
import { validateBusinessProfile } from "@/lib/number-validation";
import { voiceJson } from "@/lib/voice-responses";
export const runtime="nodejs";
export async function PUT(request:Request) {
  const operator=await numberOperator(request);if(operator instanceof Response)return operator;
  try {
    const profile=validateBusinessProfile(await numberBody(request));
    if(!profile)return voiceJson({error:"Enter your business name, contact name, country and calling purpose. Use an HTTPS website address if provided."},400);
    await saveBusinessProfile(operator.userId,profile);return voiceJson({profile});
  } catch(error){return numberApiError(error);}
}
