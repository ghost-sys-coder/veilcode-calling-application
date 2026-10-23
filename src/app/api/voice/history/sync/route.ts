import { reviewOperator } from "@/lib/review-auth";
import { syncRecentCalls } from "@/lib/review-service";
import { voiceJson } from "@/lib/voice-responses";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const operator = await reviewOperator(request);
  if (operator instanceof Response) return operator;
  try { return voiceJson({ imported:await syncRecentCalls(operator.userId) }); }
  catch { return voiceJson({ error:"Recent calls could not be synced. Your saved reviews are unchanged." },503); }
}
