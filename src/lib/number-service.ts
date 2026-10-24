import "server-only";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { getApprovedCallerIds } from "@/lib/caller-ids";
import { voiceService, voiceWebhookUrl } from "@/lib/voice-service";
import { NumberSetupError } from "@/lib/number-errors";
import { attachNumberVerification, beginNumberVerification, failNumberVerification, getNumberRequest, reviewNumberRequest } from "@/lib/number-store";
import type { NumberReviewInput } from "@/lib/number-types";

export function numberVerificationEnabled():boolean {
  try {return process.env.TWILIO_CALLING_ENABLED==="true" && Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
    && new URL(voiceWebhookUrl("/api/onboarding/numbers/verification/callback")).protocol==="https:";}catch{return false;}
}
export function assertNotConfiguredNumber(phone:string):void {
  if (getApprovedCallerIds().some(item=>item.number===phone)) throw new NumberSetupError("This number is already managed by VeilCall. Contact the administrator about access.",409);
}
export async function startNumberVerification(requestId:string,operatorId:string) {
  if (!numberVerificationEnabled()) throw new NumberSetupError("Verification calls are temporarily unavailable.",503);
  const request=await getNumberRequest(requestId,operatorId);
  if (!request) throw new NumberSetupError("Number request not found.",404);
  if (request.phone) assertNotConfiguredNumber(request.phone);
  const accountSid=process.env.TWILIO_ACCOUNT_SID!;
  const attempt=await beginNumberVerification(requestId,operatorId,accountSid);
  try {
    const validation=await voiceService().validationRequests.create({phoneNumber:attempt.phone,friendlyName:request.label,callDelay:10,
      statusCallback:voiceWebhookUrl(`/api/onboarding/numbers/verification/callback?attempt=${attempt.id}`),statusCallbackMethod:"POST"});
    if (validation.accountSid!==accountSid || validation.phoneNumber!==attempt.phone || !/^CA[0-9a-f]{32}$/i.test(validation.callSid) || !/^\d{6}$/.test(validation.validationCode)) {
      throw new Error("Unexpected verification response.");
    }
    await attachNumberVerification(attempt.id,validation.callSid,validation.validationCode);
    return {code:validation.validationCode,expiresAt:attempt.expiresAt};
  } catch(error) {
    // A timeout might still have placed a call. Keep its reservation until the
    // callback or expiry, so a retry cannot initiate a duplicate paid call.
    const status=(error as {status?:number} | null)?.status;
    if (status && status>=400 && status<500) await failNumberVerification(attempt.id);
    throw new NumberSetupError("We could not confirm the verification call. Refresh the request before trying again; an uncertain attempt stays reserved until it expires.",503);
  }
}
export async function administerNumberRequest(id:string,actor:string,input:NumberReviewInput):Promise<void> {
  const request=await getNumberRequest(id);
  if (!request) throw new NumberSetupError("Number request not found.",404);
  if (input.action==="approve" && request.phone) assertNotConfiguredNumber(request.phone);
  let provisioned;
  if (input.action==="fulfill" && input.phone) {
    if (request.kind!=="new" || request.status!=="approved" || request.revision!==input.expectedRevision) throw new NumberSetupError("Reload this approved new-number request before assigning a number.",409);
    assertNotConfiguredNumber(input.phone);
    if (parsePhoneNumberFromString(input.phone)?.country!==request.numberCountry) throw new NumberSetupError("The assigned number must match the requested country.",400);
    const numbers=await voiceService().incomingPhoneNumbers.list({phoneNumber:input.phone,limit:1});
    const owned=numbers.find(number=>number.phoneNumber===input.phone && number.accountSid===process.env.TWILIO_ACCOUNT_SID && number.capabilities.voice);
    if (!owned) throw new NumberSetupError("Choose a voice-enabled number already owned by this Twilio account.",409);
    provisioned={sid:owned.sid,accountSid:owned.accountSid};
  }
  await reviewNumberRequest(id,actor,input,provisioned);
}
