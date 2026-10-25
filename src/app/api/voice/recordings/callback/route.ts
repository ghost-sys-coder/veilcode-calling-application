import { verifiedVoiceWebhook } from "@/lib/voice-webhook";
import { voiceService } from "@/lib/voice-service";
import { saveProviderRecording } from "@/lib/review-service";
import { callSidPattern, recordingSidPattern } from "@/lib/review-validation";
import { after } from "next/server";
import { captureCallCost } from "@/lib/call-cost-service";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const params = await verifiedVoiceWebhook(request,"/api/voice/recordings/callback");
    if (!params || !callSidPattern.test(params.CallSid ?? "") || !recordingSidPattern.test(params.RecordingSid ?? "")) return new Response("Invalid recording callback",{status:403});
    // Fetch authoritative metadata; never fetch media using a webhook-supplied URL.
    const recording = await voiceService().recordings(params.RecordingSid).fetch();
    if (recording.callSid !== params.CallSid) return new Response("Invalid recording association",{status:403});
    await saveProviderRecording(recording);
    if (["completed","absent"].includes(recording.status)) after(async()=>{
      try { await captureCallCost(recording.callSid); }
      catch { console.error("Recording cost capture is temporarily unavailable."); }
    });
    return new Response(null,{status:204});
  } catch { return new Response("Recording callback unavailable",{status:503}); }
}
