import twilio from "twilio";
import { verifyCallTicket } from "@/lib/call-ticket";
import { isApprovedCallerId } from "@/lib/caller-ids";
import { validateCallingDestination } from "@/lib/destination";
import { getVoiceConfig } from "@/lib/voice-config";
import { trackCall } from "@/lib/review-call-tracking";

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
  // Bind the signed call permit to its SDK identity and currently approved caller ID.
  if (
    !ticket ||
    params.AccountSid !== config.accountSid ||
    params.From !== `client:${ticket.sub}` ||
    !validateCallingDestination(ticket.to) ||
    !isApprovedCallerId(ticket.from, config.callerIds)
  ) {
    return new Response("Call permission expired or invalid", { status: 403 });
  }
  const response = new twilio.twiml.VoiceResponse();
  const tracked = await trackCall(params.CallSid ?? "",ticket.sub,ticket.to,ticket.from);
  const dial = response.dial({ callerId: ticket.from, answerOnBridge: true, timeout: 30 });
  if (tracked) dial.number({ statusCallback:new URL("/api/voice/calls/callback",config.webhookUrl).toString(),
    statusCallbackMethod:"POST",statusCallbackEvent:["initiated","ringing","answered","completed"] },ticket.to);
  else dial.number(ticket.to);
  return new Response(response.toString(), {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}
