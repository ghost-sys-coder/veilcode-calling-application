import twilio from "twilio";
import { verifyCallTicket } from "@/lib/call-ticket";
import { validateCallingDestination } from "@/lib/destination";
import { getVoiceConfig } from "@/lib/voice-config";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let config: ReturnType<typeof getVoiceConfig>;
  try { config = getVoiceConfig(); }
  catch { return new Response("Voice unavailable", { status: 503 }); }

  if (!request.headers.get("content-type")?.includes("application/x-www-form-urlencoded")) {
    return new Response("Unsupported media type", { status: 415 });
  }
  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value !== "string" || key in params) return new Response("Invalid input", { status: 400 });
    params[key] = value;
  }
  const signature = request.headers.get("X-Twilio-Signature") ?? "";
  // Webhook URL must exactly match the HTTPS Voice URL configured on the TwiML App.
  if (!twilio.validateRequest(config.authToken, signature, config.webhookUrl, params)) {
    return new Response("Invalid Twilio signature", { status: 403 });
  }
  const ticket = params.Ticket ? verifyCallTicket(params.Ticket, config.signingSecret) : null;
  // Bind the signed destination permit to the same SDK identity that created it.
  if (
    !ticket ||
    params.AccountSid !== config.accountSid ||
    params.From !== `client:${ticket.sub}` ||
    !validateCallingDestination(ticket.to)
  ) {
    return new Response("Call permission expired or invalid", { status: 403 });
  }
  const response = new twilio.twiml.VoiceResponse();
  const dial = response.dial({ callerId: config.fromNumber, answerOnBridge: true, timeout: 30 });
  dial.number(ticket.to);
  return new Response(response.toString(), {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}
