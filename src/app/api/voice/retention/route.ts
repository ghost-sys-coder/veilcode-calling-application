import { timingSafeEqual } from "node:crypto";
import { expiredRecordings } from "@/lib/review-store";
import { deleteProviderRecording } from "@/lib/review-service";
import { voiceJson } from "@/lib/voice-responses";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual,expected)) return voiceJson({ error:"Unauthorized." },401);
  try {
    const started = Date.now();
    const expired = await expiredRecordings();
    let deleted = 0;
    for (const sid of expired) {
      if (Date.now()-started > 45000) break;
      try { await deleteProviderRecording(sid); deleted += 1; } catch { /* Tombstones keep audio private until the next retry. */ }
    }
    return voiceJson({ deleted, remaining:expired.length-deleted });
  } catch { return voiceJson({ error:"Retention processing unavailable." },503); }
}
