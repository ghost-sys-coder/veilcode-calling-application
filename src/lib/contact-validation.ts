import { callingCountries, normalizeDialingNumber, type DialingCountry } from "@/lib/calling-countries";
import type { ContactInput } from "@/lib/contact-types";

export const contactIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateContact(value:unknown):ContactInput | null {
  if (!value || typeof value !== "object") return null;
  const data=value as Record<string,unknown>;
  if (typeof data.name !== "string" || !data.name.trim() || data.name.trim().length>120 ||
    typeof data.company !== "string" || data.company.trim().length>160 ||
    typeof data.notes !== "string" || data.notes.length>5000 ||
    typeof data.country !== "string" || !callingCountries.some((item)=>item.code===data.country) || typeof data.phone !== "string") return null;
  const country=data.country as DialingCountry;
  const phone=normalizeDialingNumber(data.phone,country);
  if (!phone) return null;
  return {name:data.name.trim(),company:data.company.trim(),phone,country,notes:data.notes.trim()};
}
export function parseContactCursor(raw:string | null):{ date:string; id:string } | undefined {
  if (!raw) return undefined;
  if (raw.length>300) throw new Error("Invalid cursor");
  const value=JSON.parse(Buffer.from(raw,"base64url").toString());
  if (!value || typeof value.id !== "string" || !contactIdPattern.test(value.id) ||
    typeof value.date !== "string" || !Number.isFinite(Date.parse(value.date))) throw new Error("Invalid cursor");
  return {date:new Date(value.date).toISOString(),id:value.id};
}
