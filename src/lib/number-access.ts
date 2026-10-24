import "server-only";
import { auth } from "@clerk/nextjs/server";
import { isApprovedOperator } from "@/lib/access";
import { isSameOrigin, voiceJson } from "@/lib/voice-responses";
import { NumberSetupError } from "@/lib/number-errors";

export function isNumberAdmin(userId:string | null | undefined): boolean {
  return Boolean(userId && isApprovedOperator(userId)
    && (process.env.VEILCALL_ADMIN_USER_IDS ?? "").split(",").map(id=>id.trim()).filter(Boolean).includes(userId));
}
export function legacyCallerOwner(): string | null {
  const configured=process.env.TWILIO_CALLER_ID_OWNER_USER_ID?.trim();
  if (configured) return configured;
  // Backwards compatibility for the existing single-operator installation only.
  // Never give a newly allowlisted operator access to another person's numbers.
  const operators=[...new Set((process.env.CLERK_ALLOWED_USER_IDS ?? "").split(",").map(id=>id.trim()).filter(Boolean))];
  return operators.length===1 ? operators[0] : null;
}
export async function numberOperator(request?:Request,admin=false): Promise<{userId:string} | Response> {
  const {userId}=await auth();
  if (!userId) return voiceJson({error:"Sign in to set up a calling number."},401);
  if (request && !isSameOrigin(request)) return voiceJson({error:"Invalid origin."},403);
  if (admin && !isNumberAdmin(userId)) return voiceJson({error:"Number administrator access is required."},403);
  return {userId};
}

export async function numberBody(request:Request):Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new NumberSetupError("Expected JSON.",415);
  if (Number(request.headers.get("content-length") || 0)>8192) throw new NumberSetupError("The request is too large.",413);
  const reader=request.body?.getReader();if (!reader) throw new NumberSetupError("Enter the required details.",400);
  const chunks:Uint8Array[]=[];let size=0;
  try {
    for (;;) {const {value,done}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>8192){await reader.cancel();throw new NumberSetupError("The request is too large.",413);}chunks.push(value);}
  } finally {reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try {return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new NumberSetupError("Enter valid request details.",400);}
}
export function numberApiError(error:unknown):Response {
  if (error instanceof NumberSetupError) return voiceJson({error:error.message},error.status);
  if ((error as {code?:string} | null)?.code==="23505") return voiceJson({error:"This number already has an active assignment or request. Refresh before trying again."},409);
  return voiceJson({error:"Number setup is temporarily unavailable. Please try again."},503);
}
