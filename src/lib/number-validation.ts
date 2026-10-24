import { getCountries, parsePhoneNumberFromString } from "libphonenumber-js";
import type { BusinessProfile, NumberRequestInput, NumberReviewInput } from "@/lib/number-types";

const supportedCountries = new Set<string>(getCountries());
export const numberRequestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const names = new Intl.DisplayNames(["en"], {type:"region"});
export const businessCountries = getCountries().map(code=>({code,label:names.of(code) || code})).sort((a,b)=>a.label.localeCompare(b.label));
export const requestedNumberCountries = businessCountries.filter(item=>["US","CA","GB","AU"].includes(item.code));
const clean = (value:unknown,max:number,min=0): value is string => typeof value==="string" && value.trim().length>=min
  && value.trim().length<=max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const object = (value:unknown): value is Record<string,unknown> => Boolean(value && typeof value==="object" && !Array.isArray(value));

export function normalizeCallerNumber(value:unknown): string | null {
  if (typeof value!=="string" || value.length>40 || !/^\+[1-9][\d ().-]+$/.test(value)) return null;
  const phone=parsePhoneNumberFromString(value);
  if (!phone?.isValid() || phone.ext || !phone.country) return null;
  return phone.number;
}
export function validateBusinessProfile(value:unknown): BusinessProfile | null {
  if (!object(value) || !clean(value.businessName,160,1) || !clean(value.contactName,120,1)
    || typeof value.businessCountry!=="string" || !supportedCountries.has(value.businessCountry)
    || !clean(value.website,300) || !clean(value.purpose,1200,10)) return null;
  let website=value.website.trim();
  if (website) {
    try {
      const url=new URL(website);
      if (url.protocol!=="https:" || !url.hostname.includes(".") || url.username || url.password) return null;
      website=url.toString();
    } catch {return null;}
  }
  return {businessName:value.businessName.trim(),contactName:value.contactName.trim(),businessCountry:value.businessCountry,website,purpose:value.purpose.trim()};
}
export function validateNumberRequest(value:unknown): NumberRequestInput | null {
  if (!object(value) || (value.kind!=="existing" && value.kind!=="new") || !clean(value.label,60,1) || !clean(value.details,1000)) return null;
  if (value.kind==="existing") {
    const phone=normalizeCallerNumber(value.phone);
    if (!phone || value.ownershipConfirmed!==true) return null;
    const numberCountry=parsePhoneNumberFromString(phone)!.country!;
    return {kind:"existing",label:value.label.trim(),phone,numberCountry,details:value.details.trim(),ownershipConfirmed:true};
  }
  if (!requestedNumberCountries.some(item=>item.code===value.numberCountry)) return null;
  return {kind:"new",label:value.label.trim(),phone:null,numberCountry:value.numberCountry as string,details:value.details.trim(),ownershipConfirmed:false};
}
export function validateNumberReview(value:unknown): NumberReviewInput | null {
  if (!object(value) || typeof value.action!=="string" || !["approve","reject","fulfill","revoke"].includes(value.action)
    || !Number.isSafeInteger(value.expectedRevision) || Number(value.expectedRevision)<1 || !clean(value.note,1000)) return null;
  if (["reject","revoke"].includes(String(value.action)) && !value.note.trim()) return null;
  const phone=value.action==="fulfill" ? normalizeCallerNumber(value.phone) : null;
  if (value.action==="fulfill" && (!phone || value.complianceConfirmed!==true)) return null;
  return {action:value.action as NumberReviewInput["action"],expectedRevision:Number(value.expectedRevision),note:value.note.trim(),phone,complianceConfirmed:value.complianceConfirmed===true};
}
