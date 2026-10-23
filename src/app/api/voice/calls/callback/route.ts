import { verifiedVoiceWebhook } from "@/lib/voice-webhook";
import { reviewDatabase } from "@/lib/review-db";
import { callSidPattern } from "@/lib/review-validation";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const params = await verifiedVoiceWebhook(request,"/api/voice/calls/callback");
    if (!params || !callSidPattern.test(params.ParentCallSid ?? "") || !callSidPattern.test(params.CallSid ?? "")) return new Response("Invalid call callback",{status:403});
    const status = params.CallStatus;
    const duration = Number(params.CallDuration ?? 0);
    if (!["initiated","queued","ringing","in-progress","completed","busy","failed","no-answer","canceled"].includes(status) ||
      !Number.isInteger(duration) || duration < 0 || duration > 86400) return new Response("Invalid call outcome",{status:400});
    await reviewDatabase().query(`UPDATE veilcall_calls SET status=$2,duration_seconds=GREATEST(duration_seconds,$3),updated_at=now()
      WHERE call_sid=$1 AND (status NOT IN ('completed','busy','failed','no-answer','canceled')
        OR $2 IN ('completed','busy','failed','no-answer','canceled'))`,[params.ParentCallSid,status,duration]);
    return new Response(null,{status:204});
  } catch { return new Response("Call status storage unavailable",{status:503}); }
}
