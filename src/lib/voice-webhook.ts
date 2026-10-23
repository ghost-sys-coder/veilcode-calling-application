import "server-only";
import twilio from "twilio";
import { voiceWebhookUrl } from "@/lib/voice-service";

export async function verifiedVoiceWebhook(request: Request, path: string): Promise<Record<string,string> | null> {
  if (!request.headers.get("content-type")?.includes("application/x-www-form-urlencoded")) return null;
  if (Number(request.headers.get("content-length") || 0) > 50000) return null;
  const text = await request.text();
  if (text.length > 50000) return null;
  const params: Record<string,string> = Object.create(null);
  for (const [key,value] of new URLSearchParams(text)) {
    if (Object.hasOwn(params,key)) return null;
    params[key] = value;
  }
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || params.AccountSid !== process.env.TWILIO_ACCOUNT_SID ||
    !twilio.validateRequest(token,request.headers.get("X-Twilio-Signature") ?? "",voiceWebhookUrl(path),params)) return null;
  return params;
}
