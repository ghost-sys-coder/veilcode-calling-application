import { parsePhoneNumberFromString } from "libphonenumber-js";

export const callingCountries = [
  { code: "US", name: "United States", prefix: "+1", example: "+12125550123" },
  { code: "CA", name: "Canada", prefix: "+1", example: "+14165550123" },
  { code: "GB", name: "United Kingdom", prefix: "+44", example: "+442079460123" },
  { code: "AU", name: "Australia", prefix: "+61", example: "+61255500123" },
] as const;

export type DialingCountry = typeof callingCountries[number]["code"];

export function normalizeDialingNumber(value: string, country: DialingCountry): string | null {
  const input = value.trim();
  if (input.length > 30 || !/^\+?[\d\s().-]+$/.test(input)) return null;
  const phone = parsePhoneNumberFromString(input, country);
  if (!phone?.isValid() || phone.country !== country || phone.ext) return null;
  return phone.number;
}
