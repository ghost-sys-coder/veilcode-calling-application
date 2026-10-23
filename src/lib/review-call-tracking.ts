import "server-only";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { reviewStorageConfigured } from "@/lib/review-db";
import { storeCall } from "@/lib/review-store";
import { callSidPattern } from "@/lib/review-validation";
export async function trackCall(callSid: string, operatorId: string, to: string, from: string) {
  if (!reviewStorageConfigured() || !callSidPattern.test(callSid)) return false;
  try {
    await storeCall({ callSid,operatorId,to,from,country:parsePhoneNumberFromString(to)?.country ?? "",
      startedAt:new Date(),status:"initiated",duration:0 });
    return true;
  } catch { console.error("Call history tracking is temporarily unavailable."); return false; }
}
