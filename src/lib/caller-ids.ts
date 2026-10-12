import "server-only";
import type { CallerIdOption } from "@/lib/caller-id-types";

const e164 = /^\+[1-9]\d{1,14}$/;

export class CallerIdConfigurationError extends Error {
  constructor(public readonly variable: "TWILIO_PHONE_NUMBER" | "TWILIO_CALLER_IDS") {
    super(`Invalid ${variable} configuration.`);
  }
}

export function getApprovedCallerIds(): CallerIdOption[] {
  const primary = process.env.TWILIO_PHONE_NUMBER?.trim();
  if (primary && !e164.test(primary)) throw new CallerIdConfigurationError("TWILIO_PHONE_NUMBER");
  const options = new Map<string, CallerIdOption>();
  if (primary) options.set(primary, { number: primary, label: "Primary business number" });

  const raw = process.env.TWILIO_CALLER_IDS?.trim();
  if (!raw) return [...options.values()];

  let data: unknown;
  try { data = JSON.parse(raw); }
  catch { throw new CallerIdConfigurationError("TWILIO_CALLER_IDS"); }
  if (!Array.isArray(data) || data.length > 50) throw new CallerIdConfigurationError("TWILIO_CALLER_IDS");
  const seen = new Set<string>();
  for (const item of data) {
    if (
      !item || typeof item !== "object" ||
      typeof item.number !== "string" || !e164.test(item.number.trim()) ||
      typeof item.label !== "string" || !item.label.trim() || item.label.trim().length > 60 ||
      seen.has(item.number.trim())
    ) throw new CallerIdConfigurationError("TWILIO_CALLER_IDS");
    const number = item.number.trim();
    seen.add(number);
    // Listing the primary number here may customize its label without duplicating it.
    options.set(number, { number, label: item.label.trim() });
  }
  return [...options.values()];
}

export function isApprovedCallerId(value: unknown, options: readonly CallerIdOption[]): value is string {
  return typeof value === "string" && options.some((option) => option.number === value);
}
