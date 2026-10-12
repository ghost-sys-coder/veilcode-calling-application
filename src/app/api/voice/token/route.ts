import { auth } from "@clerk/nextjs/server";
import twilio from "twilio";
import { isApprovedOperator } from "@/lib/access";
import { getVoiceConfig } from "@/lib/voice-config";
import { voiceJson } from "@/lib/voice-responses";

export const runtime = "nodejs";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return voiceJson({ error: "Sign in to continue." }, 401);
  if (!isApprovedOperator(userId)) return voiceJson({ error: "This user is not an approved operator." }, 403);

  try {
    const config = getVoiceConfig();
    const token = new twilio.jwt.AccessToken(config.accountSid, config.apiKeySid, config.apiKeySecret, {
      identity: userId,
      ttl: 600,
    });
    token.addGrant(new twilio.jwt.AccessToken.VoiceGrant({
      outgoingApplicationSid: config.applicationSid,
      incomingAllow: false,
    }));
    return voiceJson({ token: token.toJwt() });
  } catch {
    return voiceJson({ error: "Twilio calling has not been configured." }, 503);
  }
}
