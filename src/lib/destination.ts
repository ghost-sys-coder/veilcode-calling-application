
import "server-only";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { callingCountries } from "@/lib/calling-countries";

const allowedCountries = new Set<string>(callingCountries.map((country) => country.code));

export function validateCallingDestination(
  value: unknown
): string | null {
  if (typeof value !== "string" || value.length > 30) return null;
  if (!/^\+[1-9]\d{1,14}$/.test(value)) return null;

  const phone = parsePhoneNumberFromString(value);

  if (
    !phone?.isValid() ||
    !phone.country ||
    !allowedCountries.has(phone.country)
  ) {
    return null;
  }

  const national = phone.nationalNumber;

  if (phone.country === "US" || phone.country === "CA") {
    if (national.startsWith("900") || national.slice(3, 6) === "976") {
      return null;
    }
  }

  if (phone.country === "GB") {
    // Exclude common premium, paging and special-rate ranges.
    if (/^(?:70|76|84|87|9)/.test(national)) return null;
  }

  const allowlist = (process.env.TWILIO_ALLOWED_DESTINATIONS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (allowlist.length && !allowlist.includes(phone.number)) {
    return null;
  }

  return phone.number;
}
