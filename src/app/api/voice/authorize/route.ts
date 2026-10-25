import { auth } from "@clerk/nextjs/server";
import { operatorHasAccess as isApprovedOperator } from "@/lib/access";
import { signCallTicket } from "@/lib/call-ticket";
import { isApprovedCallerId } from "@/lib/caller-ids";
import { operatorCallerIds } from "@/lib/operator-caller-ids";
import { validateCallingDestination } from "@/lib/destination";
import { getVoiceConfig } from "@/lib/voice-config";
import { isSameOrigin, voiceJson } from "@/lib/voice-responses";
import { requireRealCallingAccess } from "@/lib/billing-call-access";
import { BillingError } from "@/lib/billing-config";
import {isApprovedOperator as legacyOperator} from '@/lib/access';
import {numberBody} from '@/lib/number-access';
import {reserveLiveQuote} from '@/lib/live-calling-store';

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return voiceJson({ error: "Sign in to continue." }, 401);
  if (!(await isApprovedOperator(userId))) return voiceJson({ error: "This user is not an approved operator." }, 403);
  if (!isSameOrigin(request)) return voiceJson({ error: "Invalid origin." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return voiceJson({ error: "Expected JSON." }, 415);
  }
  let body: unknown;
  try { body = await numberBody(request); } catch { return voiceJson({ error: "Invalid request or request too large." }, 400); }
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['to','from','quoteId','consent'].includes(key)))return voiceJson({error:'Invalid call authorization fields.'},400);
  const destination = validateCallingDestination((body as { to?: unknown } | null)?.to);
  if (!destination) return voiceJson({ error: "Enter a valid US, Canadian, UK, or Australian number in international format." }, 400);
  try {
    await requireRealCallingAccess(userId);
    const config = getVoiceConfig();
    const callerIds = await operatorCallerIds(userId);
    const requestedCallerId = (body as { from?: unknown } | null)?.from;
    // Older clients default to the first number assigned to this operator.
    const callerId = requestedCallerId === undefined ? callerIds[0]?.number : requestedCallerId;
    if (!isApprovedCallerId(callerId, callerIds)) {
      return voiceJson({ error: "Select an approved calling number." }, 403);
    }
    const input=body as {quoteId?:unknown;consent?:unknown};
    const reservationId=legacyOperator(userId)?undefined:await reserveLiveQuote(userId,typeof input.quoteId==='string'?input.quoteId:'',destination,callerId,input.consent);
    return voiceJson({
      ticket: signCallTicket(userId, destination, callerId, config.signingSecret,reservationId),
      destination, callerId,
    });
  } catch(error) {
    if(error instanceof BillingError)return voiceJson({error:error.message},error.status);
    return voiceJson({ error: "Twilio calling has not been configured." }, 503);
  }
}
