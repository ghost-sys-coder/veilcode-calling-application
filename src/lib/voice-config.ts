import "server-only";

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
  const missing = required.filter((key) => !process.env[key]?.trim());
  const enabled = process.env.TWILIO_CALLING_ENABLED === "true";
  const signingSecretValid = (process.env.TWILIO_CALL_SIGNING_SECRET?.length ?? 0) >= 32;
  if (!signingSecretValid && !missing.includes("TWILIO_CALL_SIGNING_SECRET")) missing.push("TWILIO_CALL_SIGNING_SECRET");
  return { ready: missing.length === 0 && enabled, enabled, missing };
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
    fromNumber: process.env.TWILIO_PHONE_NUMBER!,
    signingSecret,
    webhookUrl: process.env.TWILIO_WEBHOOK_URL!,
  };
}
