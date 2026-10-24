import "server-only";
import { numberOperator, numberBody } from "@/lib/number-access";
import { BillingError } from "@/lib/billing-config";
import { voiceJson } from "@/lib/voice-responses";
export { numberOperator as billingOperator, numberBody as billingBody };
export function billingApiError(error:unknown):Response {
  if(error instanceof BillingError)return voiceJson({error:error.message},error.status);
  if(error && typeof error==="object" && "name" in error && error.name==="NumberSetupError")
    return voiceJson({error:(error as Error).message},Number((error as {status?:number}).status)||400);
  return voiceJson({error:"Billing is temporarily unavailable. Please try again."},503);
}
