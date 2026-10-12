import { auth } from "@clerk/nextjs/server";
import twilio from "twilio";
import { isApprovedOperator } from "@/lib/access";
import { getVoiceConfig } from "@/lib/voice-config";
import { getVoiceOutcome } from "@/lib/voice-outcome";
import { voiceJson } from "@/lib/voice-responses";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return voiceJson({ error: "Sign in to continue." }, 401);
  if (!isApprovedOperator(userId)) return voiceJson({ error: "This user is not an approved operator." }, 403);
  const callSid = new URL(request.url).searchParams.get("callSid");
  if (!callSid || !/^CA[0-9a-f]{32}$/i.test(callSid)) {
    return voiceJson({ error: "Invalid call reference." }, 400);
  }
  try {
    const config = getVoiceConfig();
    const client = twilio(config.accountSid, config.authToken, { timeout: 10000 });
    const parent = await client.calls(callSid).fetch();
    // Only the operator who initiated the browser call may inspect its outcome.
    if (parent.from !== `client:${userId}` || parent.parentCallSid) {
      return voiceJson({ error: "Call not found." }, 404);
    }
    const [children, notifications] = await Promise.all([
      client.calls.list({ parentCallSid: callSid, limit: 1 }),
      client.calls(callSid).notifications.list({ log: 0, limit: 10 }),
    ]);
    const child = children[0];
    const childNotifications = child
      ? await client.calls(child.sid).notifications.list({ log: 0, limit: 10 })
      : [];
    const errorCode = [...notifications, ...childNotifications]
      .find((notification) => notification.errorCode && notification.errorCode !== "0")?.errorCode;
    // Parent completion alone does not prove the recipient was reached.
    return voiceJson(getVoiceOutcome(child?.status ?? (parent.status === "completed" ? "unknown" : parent.status), errorCode));
  } catch {
    return voiceJson({ error: "Call details are unavailable. Check Twilio Call Logs." }, 503);
  }
}
