import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

type CallTicket = { sub: string; to: string; from: string; iat: number; exp: number; nonce: string;reservationId?:string };

function signature(value: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(value).digest();
}

export function signCallTicket(userId: string, destination: string, callerId: string, secret: string,reservationId?:string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: CallTicket = {
    sub: userId,
    to: destination,
    from: callerId,
    iat: now,
    exp: now + 45,
    nonce: randomBytes(16).toString("hex"),
    ...(reservationId?{reservationId}:{}),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded, secret).toString("base64url")}`;
}

export function verifyCallTicket(ticket: string, secret: string): CallTicket | null {
  if (ticket.length > 2048) return null;
  const parts = ticket.split(".");
  if (parts.length !== 2) return null;
  const [encoded, encodedSignature] = parts;
  try {
    const provided = Buffer.from(encodedSignature, "base64url");
    const expected = signature(encoded, secret);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
    const data: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!data || typeof data !== "object") return null;
    const call = data as Partial<CallTicket>;
    const now = Math.floor(Date.now() / 1000);
    if (
      typeof call.sub !== "string" || !call.sub.startsWith("user_") ||
      typeof call.to !== "string" ||
      typeof call.from !== "string" || !/^\+[1-9]\d{1,14}$/.test(call.from) ||
      typeof call.iat !== "number" ||
      typeof call.exp !== "number" ||
      typeof call.nonce !== "string" ||
      (call.reservationId!==undefined&&(typeof call.reservationId!=='string'||!/^[0-9a-f-]{36}$/.test(call.reservationId))) ||
      call.iat > now + 5 || call.exp <= now || call.exp - call.iat !== 45
    ) return null;
    return call as CallTicket;
  } catch {
    return null;
  }
}
