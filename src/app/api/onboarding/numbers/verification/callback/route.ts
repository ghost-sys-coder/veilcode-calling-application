import { verifiedVoiceWebhook } from "@/lib/voice-webhook";
import { voiceService } from "@/lib/voice-service";
import { completeNumberVerification, getVerificationAttempt } from "@/lib/number-store";
import { normalizeCallerNumber, numberRequestIdPattern } from "@/lib/number-validation";
export const runtime="nodejs";
export async function POST(request:Request) {
  const query=new URL(request.url).searchParams;
  const id=query.get("attempt") ?? "";
  if(!numberRequestIdPattern.test(id) || [...query.keys()].some(key=>key!=="attempt") || query.getAll("attempt").length!==1)return new Response("Invalid verification callback",{status:403});
  try {
    const params=await verifiedVoiceWebhook(request,`/api/onboarding/numbers/verification/callback?attempt=${id}`);
    if(!params || !/^CA[0-9a-f]{32}$/i.test(params.CallSid ?? "") || !["success","failed"].includes(params.VerificationStatus))return new Response("Invalid verification callback",{status:403});
    const attempt=await getVerificationAttempt(id);
    if(!attempt || attempt.accountSid!==params.AccountSid || attempt.phone!==normalizeCallerNumber(params.To)
      || (attempt.callSid && attempt.callSid!==params.CallSid))return new Response("Invalid verification callback",{status:403});
    if(["success","failed"].includes(attempt.status) || new Date(attempt.expiresAt).getTime()<=Date.now())return new Response(null,{status:204});
    let sid:string | null=null;
    if(params.VerificationStatus==="success"){
      if(!/^PN[0-9a-f]{32}$/i.test(params.OutgoingCallerIdSid ?? ""))return new Response("Invalid verified caller",{status:403});
      const caller=await voiceService().outgoingCallerIds(params.OutgoingCallerIdSid).fetch();
      if(caller.phoneNumber!==attempt.phone || caller.accountSid!==attempt.accountSid)return new Response("Invalid verified caller",{status:403});
      sid=caller.sid;
    }
    await completeNumberVerification(attempt,params.CallSid,sid);return new Response(null,{status:204});
  } catch{return new Response("Verification callback unavailable",{status:503});}
}
