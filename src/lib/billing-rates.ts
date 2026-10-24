import "server-only";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { BillingError } from "@/lib/billing-config";
import type { BillingRate } from "@/lib/billing-types";

// Test fixtures only. No live rate card is published or inferred from these rates.
export function testCallingRate(to:string,from:string):BillingRate {
  const destination=parsePhoneNumberFromString(to),origin=parsePhoneNumberFromString(from);
  if(!destination?.isValid() || destination.number!==to || !origin?.isValid() || origin.number!==from)
    throw new BillingError("Choose a valid calling number and destination.");
  const type=destination.getType();
  const rates:Record<string,number>={GB_FIXED_LINE:60000,GB_MOBILE:90000,AU_FIXED_LINE:80000,AU_MOBILE:180000};
  const rateMicro=rates[`${destination.country}_${type}`];
  if(!rateMicro)throw new BillingError("This route is not available in the billing sandbox.");
  return {mode:"test",route:`${origin.country ?? "unknown"} → ${destination.country} ${type==="MOBILE" ? "mobile" : "landline"}`,rateMicro,feeMicro:10000};
}
export function reservationAmounts(availableMicro:number,rate:BillingRate) {
  if(!Number.isSafeInteger(availableMicro) || availableMicro<0)throw new BillingError("Calling balance is unavailable.",402);
  const minutes=Math.min(5,Math.floor((availableMicro-rate.feeMicro)/rate.rateMicro));
  if(minutes<1)throw new BillingError("Add calling credit before starting this call.",402);
  return {maxSeconds:minutes*60,heldMicro:rate.feeMicro+minutes*rate.rateMicro};
}
export function usageCharge(seconds:number,rateMicro:number,feeMicro:number):number {
  if(!Number.isInteger(seconds) || seconds<0 || seconds>86400)throw new BillingError("Invalid provider call duration.");
  return feeMicro+Math.ceil(seconds/60)*rateMicro;
}
