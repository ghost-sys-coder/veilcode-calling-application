import "server-only";
import { auth } from "@clerk/nextjs/server";
import { isApprovedOperator } from "@/lib/access";
import { isSameOrigin, voiceJson } from "@/lib/voice-responses";

export async function reviewOperator(request?: Request): Promise<{ userId: string } | Response> {
  const { userId } = await auth();
  if (!userId) return voiceJson({ error: "Sign in to continue." }, 401);
  if (!isApprovedOperator(userId)) return voiceJson({ error: "Operator access is required." }, 403);
  if (request && !isSameOrigin(request)) return voiceJson({ error: "Invalid origin." }, 403);
  return { userId };
}
export async function reviewBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json") ||
    Number(request.headers.get("content-length") || 0) > 50000) throw new Error("Expected a small JSON request.");
  const text = await request.text();
  if (text.length > 50000) throw new Error("Request is too large.");
  return JSON.parse(text);
}
