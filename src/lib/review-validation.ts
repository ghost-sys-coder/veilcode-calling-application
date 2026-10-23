import type { ReviewInput } from "@/lib/review-types";

export const callSidPattern = /^CA[0-9a-f]{32}$/i;
export const recordingSidPattern = /^RE[0-9a-f]{32}$/i;
export function validateReviewInput(value: unknown): ReviewInput | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<ReviewInput>;
  if (typeof data.notes !== "string" || data.notes.length > 10000 ||
    !(data.rating === null || (Number.isInteger(data.rating) && data.rating! >= 1 && data.rating! <= 5)) ||
    !Array.isArray(data.bookmarks) || data.bookmarks.length > 50) return null;
  const ids = new Set<string>();
  for (const item of data.bookmarks) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !/^[\w-]{1,64}$/.test(item.id) || ids.has(item.id) ||
      typeof item.recordingSid !== "string" || !recordingSidPattern.test(item.recordingSid) ||
      typeof item.seconds !== "number" || !Number.isFinite(item.seconds) || item.seconds < 0 || item.seconds > 86400 ||
      typeof item.note !== "string" || item.note.length > 500) return null;
    ids.add(item.id);
  }
  return { notes: data.notes, rating: data.rating!, bookmarks: data.bookmarks.map(({ id, recordingSid, seconds, note }) => ({ id, recordingSid, seconds, note })) };
}

export function retentionDays(): number {
  const days = Number(process.env.RECORDING_RETENTION_DAYS || "30");
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error("RECORDING_RETENTION_DAYS must be between 1 and 365.");
  return days;
}

export function recordingAccessible(recording: { status: string; expiresAt: string; deletedAt: string | null }, now = Date.now()): boolean {
  return recording.status === "completed" && !recording.deletedAt && Date.parse(recording.expiresAt) > now;
}
