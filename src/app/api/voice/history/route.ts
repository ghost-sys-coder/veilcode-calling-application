import { reviewOperator } from "@/lib/review-auth";
import { listReviews } from "@/lib/review-store";
import { callSidPattern } from "@/lib/review-validation";
import { voiceJson } from "@/lib/voice-responses";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const operator = await reviewOperator();
  if (operator instanceof Response) return operator;
  const raw = new URL(request.url).searchParams.get("cursor");
  let cursor: { date: string; sid: string } | undefined;
  if (raw) {
    try {
      if (raw.length > 300) throw new Error();
      cursor = JSON.parse(Buffer.from(raw,"base64url").toString());
      if (!cursor || typeof cursor.sid !== "string" || !callSidPattern.test(cursor.sid) ||
        typeof cursor.date !== "string" || !Number.isFinite(Date.parse(cursor.date))) throw new Error();
    } catch { return voiceJson({ error:"Invalid history cursor." },400); }
  }
  try { return voiceJson(await listReviews(operator.userId,cursor)); }
  catch { return voiceJson({ error:"Call history is unavailable. Check database configuration." },503); }
}
