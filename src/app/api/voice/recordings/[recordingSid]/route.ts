import { reviewOperator } from "@/lib/review-auth";
import { getOwnedRecording } from "@/lib/review-store";
import { deleteProviderRecording } from "@/lib/review-service";
import { recordingSidPattern } from "@/lib/review-validation";
import { voiceJson } from "@/lib/voice-responses";
export const runtime = "nodejs";
type Context = { params:Promise<{ recordingSid:string }> };
export async function DELETE(request: Request, context: Context) {
  const operator = await reviewOperator(request);
  if (operator instanceof Response) return operator;
  const { recordingSid } = await context.params;
  if (!recordingSidPattern.test(recordingSid)) return voiceJson({ error:"Invalid recording reference." },400);
  try {
    const recording = await getOwnedRecording(recordingSid,operator.userId);
    if (!recording) return voiceJson({ error:"Recording not found." },404);
    if (["in-progress","paused"].includes(recording.status)) return voiceJson({ error:"Stop recording before deleting it." },409);
    await deleteProviderRecording(recordingSid);
    return voiceJson({ deleted:true });
  } catch { return voiceJson({ error:"Playback has been disabled if deletion started. Provider deletion will retry through the retention job." },503); }
}
