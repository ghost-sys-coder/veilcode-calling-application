import { numberApiError, numberBody, numberOperator } from "@/lib/number-access";
import { createNumberRequest } from "@/lib/number-store";
import { validateNumberRequest } from "@/lib/number-validation";
import { assertNotConfiguredNumber } from "@/lib/number-service";
import { voiceJson } from "@/lib/voice-responses";
export const runtime="nodejs";
export async function POST(request:Request) {
  const operator=await numberOperator(request);if(operator instanceof Response)return operator;
  try {
    const input=validateNumberRequest(await numberBody(request));
    if(!input)return voiceJson({error:"Choose a number option, enter a label and confirm ownership for an existing international phone number."},400);
    if(input.phone)assertNotConfiguredNumber(input.phone);
    const id=await createNumberRequest(operator.userId,input);return voiceJson({id},201);
  } catch(error){return numberApiError(error);}
}
