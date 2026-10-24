import { auth } from "@clerk/nextjs/server";
import twilio from "twilio";
import { operatorHasAccess as isApprovedOperator } from "@/lib/access";
import { getVoiceConfig } from "@/lib/voice-config";
import { voiceJson } from "@/lib/voice-responses";
import { operatorCallerIds } from "@/lib/operator-caller-ids";
import { requireRealCallingAccess } from "@/lib/billing-call-access";
import { BillingError } from "@/lib/billing-config";

export const runtime = "nodejs";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return voiceJson({ error: "Sign in to continue." }, 401);
  if (!(await isApprovedOperator(userId))) return voiceJson({ error: "This user is not an approved operator." }, 403);

  try {
    requireRealCallingAccess(userId);
    const config = getVoiceConfig();
    if (!(await operatorCallerIds(userId)).length) return voiceJson({error:"Set up an approved calling number first."},403);
    const token = new twilio.jwt.AccessToken(config.accountSid, config.apiKeySid, config.apiKeySecret, {
      identity: userId,
      ttl: 600,
    });
    token.addGrant(new twilio.jwt.AccessToken.VoiceGrant({
      outgoingApplicationSid: config.applicationSid,
      incomingAllow: false,
    }));
    return voiceJson({ token: token.toJwt() });
  } catch(error) {
    if(error instanceof BillingError)return voiceJson({error:error.message},error.status);
    return voiceJson({ error: "Twilio calling has not been configured." }, 503);
  }
}
