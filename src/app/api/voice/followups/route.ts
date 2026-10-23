import { reviewOperator } from "@/lib/review-auth";
import { listFollowUps } from "@/lib/followup-store";
import { callSidPattern } from "@/lib/review-validation";
import type { FollowUpView } from "@/lib/followup-types";
import { voiceJson } from "@/lib/voice-responses";
export const runtime="nodejs";
export async function GET(request:Request) {
  const operator=await reviewOperator();if (operator instanceof Response) return operator;
  const params=new URL(request.url).searchParams;
  const view=params.get("view") ?? "open";
  if (!["open","overdue","upcoming","completed"].includes(view)) return voiceJson({error:"Invalid follow-up view."},400);
  let cursor;
  try {
    const raw=params.get("cursor");
    if (raw) {
      if (raw.length>300) throw new Error();
      const value=JSON.parse(Buffer.from(raw,"base64url").toString());
      if (typeof value.date!=="string" || !Number.isFinite(Date.parse(value.date)) || typeof value.sid!=="string" || !callSidPattern.test(value.sid)) throw new Error();
      cursor={date:new Date(value.date).toISOString(),sid:value.sid};
    }
  } catch {return voiceJson({error:"Invalid page reference."},400);}
  try {return voiceJson(await listFollowUps(operator.userId,view as FollowUpView,cursor));}
  catch {return voiceJson({error:"Follow-ups could not be loaded. Please retry."},503);}
}
