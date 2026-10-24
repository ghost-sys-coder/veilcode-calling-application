import { emailDispatchAuthorized } from "@/lib/email-dispatch-auth";
import { dispatchCallbackEmails } from "@/lib/email-reminder-service";
import { voiceJson } from "@/lib/voice-responses";
export const runtime="nodejs";
export const maxDuration=60;
export async function GET(request:Request) {
  if(!await emailDispatchAuthorized(request))return voiceJson({error:"Unauthorized."},401);
  try {return voiceJson(await dispatchCallbackEmails());}
  catch {console.error("Callback email dispatch unavailable.");return voiceJson({error:"Email reminder processing unavailable."},503);}
}
