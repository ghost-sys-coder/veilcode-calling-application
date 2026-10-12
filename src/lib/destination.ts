import "server-only";
import { parsePhoneNumberFromString } from "libphonenumber-js";

export function validateUsDestination(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 30) return null;
  if (!/^\+[1-9]\d{1,14}$/.test(value)) return null;
  const number = parsePhoneNumberFromString(value);
  if (!number?.isValid() || number.country !== "US") return null;
  // Reject US 900 premium services and 976 exchanges.
  const national = number.nationalNumber;
  if (national.startsWith("900") || national.slice(3, 6) === "976") return null;
  const allowlist = (process.env.TWILIO_ALLOWED_DESTINATIONS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (allowlist.length && !allowlist.includes(number.number)) return null;
  return number.number;
}
