import { reviewOperator, reviewBody } from "@/lib/review-auth";
import { getFollowUp, saveFollowUp } from "@/lib/followup-store";
import { validateFollowUp } from "@/lib/followup-validation";
import { callSidPattern } from "@/lib/review-validation";
import { voiceJson } from "@/lib/voice-responses";
export const runtime="nodejs";
type Context={params:Promise<{callSid:string}>};
export async function GET(_request:Request,context:Context) {
  const operator=await reviewOperator();if (operator instanceof Response) return operator;
  const {callSid}=await context.params;
  if (!callSidPattern.test(callSid)) return voiceJson({error:"Invalid call reference."},400);
  try {const record=await getFollowUp(callSid,operator.userId);return record ? voiceJson(record) : voiceJson({error:"Call not found."},404);}
  catch {return voiceJson({error:"Call outcome could not be loaded. Please retry."},503);}
}
export async function PUT(request:Request,context:Context) {
  const operator=await reviewOperator(request);if (operator instanceof Response) return operator;
  const {callSid}=await context.params;
  if (!callSidPattern.test(callSid)) return voiceJson({error:"Invalid call reference."},400);
  let input;try {input=validateFollowUp(await reviewBody(request));} catch {input=null;}
  if (!input) return voiceJson({error:"Choose an outcome, a valid callback time when needed, and a note of up to 5,000 characters."},400);
  try {
    if (!await saveFollowUp(callSid,operator.userId,input)) return voiceJson({error:"Call not found."},404);
    return voiceJson({saved:true});
  } catch {return voiceJson({error:"Call outcome could not be saved. Please retry."},503);}
}
