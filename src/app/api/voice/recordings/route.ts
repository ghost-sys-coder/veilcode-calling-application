import { reviewOperator, reviewBody } from "@/lib/review-auth";
import { controlRecording, ReviewError, ownedProviderCall, reconcileRecordings } from "@/lib/review-service";
import { callSidPattern, recordingSidPattern } from "@/lib/review-validation";
import { voiceJson } from "@/lib/voice-responses";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  const operator = await reviewOperator();
  if (operator instanceof Response) return operator;
  const callSid = new URL(request.url).searchParams.get("callSid") ?? "";
  if (!callSidPattern.test(callSid)) return voiceJson({ error:"Invalid call reference." },400);
  try {
    await ownedProviderCall(callSid,operator.userId);
    const review = await reconcileRecordings(callSid,operator.userId);
    return voiceJson({ recordings:review.recordings,active:review.recordings.find((item) => !item.deletedAt && ["in-progress","paused"].includes(item.status)) ?? null });
  } catch (error) { return voiceJson({ error:error instanceof ReviewError ? error.message : "Recording status is unavailable." },error instanceof ReviewError ? error.status : 503); }
}
export async function POST(request: Request) {
  const operator = await reviewOperator(request);
  if (operator instanceof Response) return operator;
  let input;
  try { input = await reviewBody(request) as { callSid?:unknown; action?:unknown; recordingSid?:unknown; consentConfirmed?:unknown }; }
  catch { return voiceJson({ error:"Invalid recording request." },400); }
  if (!input || typeof input.callSid !== "string" || !callSidPattern.test(input.callSid) ||
    typeof input.action !== "string" || !["start","pause","resume","stop"].includes(input.action) ||
    (input.recordingSid !== undefined && (typeof input.recordingSid !== "string" || !recordingSidPattern.test(input.recordingSid)))) {
    return voiceJson({ error:"Invalid recording request." },400);
  }
  try {
    const review = await controlRecording({ callSid:input.callSid,action:input.action,recordingSid:input.recordingSid as string | undefined,consentConfirmed:input.consentConfirmed === true },operator.userId);
    return voiceJson({ recordings:review.recordings,active:review.recordings.find((item) => !item.deletedAt && ["in-progress","paused"].includes(item.status)) ?? null });
  } catch (error) { return voiceJson({ error:error instanceof ReviewError ? error.message : "The recording change could not be confirmed. Refresh its status before retrying." },error instanceof ReviewError ? error.status : 503); }
}
