import { reviewOperator, reviewBody } from "@/lib/review-auth";
import { getCallWrapUp, saveCallWrapUp } from "@/lib/call-wrapup-store";
import { validateWrapUp } from "@/lib/call-wrapup";
import { ownedProviderCall, ReviewError } from "@/lib/review-service";
import { callSidPattern } from "@/lib/review-validation";
import { voiceJson } from "@/lib/voice-responses";
export const runtime="nodejs";
export const maxDuration=60;
type Context={params:Promise<{callSid:string}>};

export async function GET(_request:Request,context:Context) {
  const operator=await reviewOperator();
  if (operator instanceof Response) return operator;
  const {callSid}=await context.params;
  if (!callSidPattern.test(callSid)) return voiceJson({error:"Invalid call reference."},400);
  try {
    let call=await getCallWrapUp(callSid,operator.userId);
    if (!call) {
      // Recover a just-finished call if its initial tracking callback was delayed.
      // Provider ownership is checked before any metadata is stored.
      await ownedProviderCall(callSid,operator.userId);
      call=await getCallWrapUp(callSid,operator.userId);
    }
    return call ? voiceJson(call) : voiceJson({error:"Call not found."},404);
  } catch(error) {return voiceJson({error:error instanceof ReviewError ? error.message : "Call details are unavailable. Try again."},error instanceof ReviewError ? error.status : 503);}
}

export async function PUT(request:Request,context:Context) {
  const operator=await reviewOperator(request);
  if (operator instanceof Response) return operator;
  const {callSid}=await context.params;
  if (!callSidPattern.test(callSid)) return voiceJson({error:"Invalid call reference."},400);
  let input;
  try {input=validateWrapUp(await reviewBody(request));} catch {input=null;}
  if (!input) return voiceJson({error:"Check the outcome, rating, notes and callback date."},400);
  try {
    const result=await saveCallWrapUp(callSid,operator.userId,input);
    if (result==="conflict") return voiceJson({error:"This call was edited elsewhere. Your draft is still here. Reload the saved details before saving again."},409);
    return result ? voiceJson(result) : voiceJson({error:"Call not found."},404);
  } catch {return voiceJson({error:"Call details were not saved. Your draft is still here; try again."},503);}
}
