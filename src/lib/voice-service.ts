import "server-only";
import twilio from "twilio";
export function voiceService() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) throw new Error("Voice service is not configured.");
  return twilio(accountSid, authToken, { timeout: 10000 });
}
export function voiceWebhookUrl(path: string): string {
  const base = process.env.TWILIO_WEBHOOK_URL;
  if (!base) throw new Error("Voice callback URL is missing.");
  const url = new URL(path, base);
  if (url.protocol !== "https:") throw new Error("A public HTTPS callback is required.");
  return url.toString();
}
