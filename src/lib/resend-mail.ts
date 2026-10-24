import "server-only";
import type { EmailPayload } from "@/lib/email-reminder-types";
export class MailError extends Error {
  constructor(public code:string,public retryable:boolean){super("Email request could not be confirmed.");}
}
export async function sendReminderEmail(apiKey:string,payload:EmailPayload,idempotencyKey:string):Promise<string> {
  let response:Response;
  try {
    response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json","Idempotency-Key":idempotencyKey},body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)});
  } catch {throw new MailError("network_error",true);}
  const body=await response.json().catch(()=>null);
  if (!response.ok) throw new MailError(`resend_${response.status}`,response.status===429 || response.status>=500 || (response.status===409 && body?.name==="concurrent_idempotent_requests"));
  if (typeof body?.id!=="string" || !/^[a-f0-9-]{36}$/i.test(body.id)) throw new MailError("invalid_response",true);
  return body.id;
}
