import { reviewBody, reviewOperator } from "@/lib/review-auth";
import { callSidPattern } from "@/lib/review-validation";
import { validateReminderAction } from "@/lib/reminder-validation";
import { actOnReminder } from "@/lib/reminder-store";
import { voiceJson } from "@/lib/voice-responses";
export const runtime="nodejs";
export async function POST(request:Request,{params}:{params:Promise<{callSid:string}>}) {
  const operator=await reviewOperator(request);if (operator instanceof Response) return operator;
  const {callSid}=await params;
  if (!callSidPattern.test(callSid)) return voiceJson({error:"Invalid callback reference."},400);
  let input;
  try {input=validateReminderAction(await reviewBody(request));} catch {input=null;}
  if (!input) return voiceJson({error:"Choose a valid reminder action and a future time when rescheduling."},400);
  try {
    if (!await actOnReminder(callSid,operator.userId,input)) return voiceJson({error:"This callback has changed or is unavailable. Refresh reminders before trying again."},409);
    return voiceJson({saved:true});
  } catch {return voiceJson({error:"The reminder action could not be confirmed. Refresh reminders before retrying."},503);}
}
