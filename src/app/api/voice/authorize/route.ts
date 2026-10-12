import { auth } from "@clerk/nextjs/server";
import { isApprovedOperator } from "@/lib/access";
import { signCallTicket } from "@/lib/call-ticket";
import { validateCallingDestination } from "@/lib/destination";
import { getVoiceConfig } from "@/lib/voice-config";
import { isSameOrigin, voiceJson } from "@/lib/voice-responses";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return voiceJson({ error: "Sign in to continue." }, 401);
  if (!isApprovedOperator(userId)) return voiceJson({ error: "This user is not an approved operator." }, 403);
  if (!isSameOrigin(request)) return voiceJson({ error: "Invalid origin." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return voiceJson({ error: "Expected JSON." }, 415);
  }
  let body: unknown;
  try { body = await request.json(); } catch { return voiceJson({ error: "Invalid request." }, 400); }
  const destination = validateCallingDestination((body as { to?: unknown } | null)?.to);
  if (!destination) return voiceJson({ error: "Enter a valid US, Canadian, or UK number in international format." }, 400);
  try {
    const { signingSecret } = getVoiceConfig();
    return voiceJson({ ticket: signCallTicket(userId, destination, signingSecret), destination });
  } catch {
    return voiceJson({ error: "Twilio calling has not been configured." }, 503);
  }
}
