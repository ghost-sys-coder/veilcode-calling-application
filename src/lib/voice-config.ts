import "server-only";
import { CallerIdConfigurationError, getApprovedCallerIds } from "@/lib/caller-ids";
import type { CallerIdOption } from "@/lib/caller-id-types";

const required = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_API_KEY_SID",
  "TWILIO_API_KEY_SECRET",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_TWIML_APP_SID",
  "TWILIO_PHONE_NUMBER",
  "TWILIO_CALL_SIGNING_SECRET",
  "TWILIO_WEBHOOK_URL",
] as const;

export function getVoiceConfigStatus() {
  const missing: string[] = required.filter((key) => !process.env[key]?.trim());
  let callerIds: CallerIdOption[] = [];
  try { callerIds = getApprovedCallerIds(); }
  catch (error) {
    if (!(error instanceof CallerIdConfigurationError)) throw error;
    if (!missing.includes(error.variable)) missing.push(error.variable);
  }
  const enabled = process.env.TWILIO_CALLING_ENABLED === "true";
  const signingSecretValid = (process.env.TWILIO_CALL_SIGNING_SECRET?.length ?? 0) >= 32;
  if (!signingSecretValid && !missing.includes("TWILIO_CALL_SIGNING_SECRET")) missing.push("TWILIO_CALL_SIGNING_SECRET");
  return { ready: missing.length === 0 && enabled, enabled, missing, callerIds };
}

export function getVoiceConfig() {
  const status = getVoiceConfigStatus();
  if (!status.ready) throw new Error("Voice configuration is incomplete or calling is disabled.");
  const signingSecret = process.env.TWILIO_CALL_SIGNING_SECRET!;
  if (signingSecret.length < 32) throw new Error("TWILIO_CALL_SIGNING_SECRET must be at least 32 characters.");
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID!,
    apiKeySid: process.env.TWILIO_API_KEY_SID!,
    apiKeySecret: process.env.TWILIO_API_KEY_SECRET!,
    authToken: process.env.TWILIO_AUTH_TOKEN!,
    applicationSid: process.env.TWILIO_TWIML_APP_SID!,
    fromNumber: status.callerIds[0].number,
    callerIds: status.callerIds,
    signingSecret,
    webhookUrl: process.env.TWILIO_WEBHOOK_URL!,
  };
}
