import { reviewOperator, reviewBody } from "@/lib/review-auth";
import { createContact, listContacts } from "@/lib/contact-store";
import { validateContact, parseContactCursor } from "@/lib/contact-validation";
import { voiceJson } from "@/lib/voice-responses";
export const runtime="nodejs";

export async function GET(request:Request) {
  const operator=await reviewOperator();
  if (operator instanceof Response) return operator;
  const params=new URL(request.url).searchParams;
  const search=(params.get("search") ?? "").trim();
  let cursor;
  try { if (search.length>120) throw new Error(); cursor=parseContactCursor(params.get("cursor")); }
  catch { return voiceJson({error:"Invalid contact search or page reference."},400); }
  try { return voiceJson(await listContacts(operator.userId,search,cursor)); }
  catch { return voiceJson({error:"Contacts could not be loaded. Please retry."},503); }
}
export async function POST(request:Request) {
  const operator=await reviewOperator(request);
  if (operator instanceof Response) return operator;
  let input;
  try { input=validateContact(await reviewBody(request)); } catch { input=null; }
  if (!input) return voiceJson({error:"Enter a name and a valid phone number for the selected country."},400);
  try { return voiceJson(await createContact(operator.userId,input),201); }
  catch (error) { return voiceJson({error:(error as {code?:string}).code==="23505" ? "A contact with this phone number already exists." : "Contact could not be saved. Please retry."},(error as {code?:string}).code==="23505" ? 409 : 503); }
}
