import { reviewOperator, reviewBody } from "@/lib/review-auth";
import { getReview, saveReview } from "@/lib/review-store";
import { reconcileRecordings, ReviewError } from "@/lib/review-service";
import { callSidPattern, validateReviewInput } from "@/lib/review-validation";
import { voiceJson } from "@/lib/voice-responses";
export const runtime = "nodejs";
type Context = { params: Promise<{ callSid:string }> };
export async function GET(_request: Request, context: Context) {
  const operator = await reviewOperator();
  if (operator instanceof Response) return operator;
  const { callSid } = await context.params;
  if (!callSidPattern.test(callSid)) return voiceJson({ error:"Invalid call reference." },400);
  try { return voiceJson(await reconcileRecordings(callSid,operator.userId)); }
  catch (error) { return voiceJson({ error:error instanceof ReviewError ? error.message : "Review is unavailable." },error instanceof ReviewError ? error.status : 503); }
}
export async function PUT(request: Request, context: Context) {
  const operator = await reviewOperator(request);
  if (operator instanceof Response) return operator;
  const { callSid } = await context.params;
  if (!callSidPattern.test(callSid)) return voiceJson({ error:"Invalid call reference." },400);
  let input;
  try { input = validateReviewInput(await reviewBody(request)); } catch { input = null; }
  if (!input) return voiceJson({ error:"Check the notes, rating and bookmarks." },400);
  try {
    const call = await getReview(callSid,operator.userId);
    if (!call) return voiceJson({ error:"Call not found." },404);
    if (input.bookmarks.some((bookmark) => {
      const recording = call.recordings.find((item) => item.sid === bookmark.recordingSid);
      return !recording || bookmark.seconds > recording.duration;
    })) return voiceJson({ error:"A bookmark is outside this call's recording." },400);
    await saveReview(callSid,operator.userId,input);
    return voiceJson({ saved:true });
  } catch { return voiceJson({ error:"Your review could not be saved. Try again." },503); }
}
