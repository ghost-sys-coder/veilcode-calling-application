import { reviewOperator, reviewBody } from "@/lib/review-auth";
import { getContact, updateContact, deleteContact } from "@/lib/contact-store";
import { contactIdPattern, validateContact } from "@/lib/contact-validation";
import { voiceJson } from "@/lib/voice-responses";
export const runtime="nodejs";
type Context={params:Promise<{contactId:string}>};

export async function GET(_request:Request,context:Context) {
  const operator=await reviewOperator();
  if (operator instanceof Response) return operator;
  const {contactId}=await context.params;
  if (!contactIdPattern.test(contactId)) return voiceJson({error:"Invalid contact reference."},400);
  try { const contact=await getContact(contactId,operator.userId); return contact ? voiceJson(contact) : voiceJson({error:"Contact not found."},404); }
  catch { return voiceJson({error:"Contact could not be loaded."},503); }
}
export async function PUT(request:Request,context:Context) {
  const operator=await reviewOperator(request);
  if (operator instanceof Response) return operator;
  const {contactId}=await context.params;
  if (!contactIdPattern.test(contactId)) return voiceJson({error:"Invalid contact reference."},400);
  let input;
  try { input=validateContact(await reviewBody(request)); } catch { input=null; }
  if (!input) return voiceJson({error:"Enter a name and a valid phone number for the selected country."},400);
  try { const contact=await updateContact(contactId,operator.userId,input); return contact ? voiceJson(contact) : voiceJson({error:"Contact not found."},404); }
  catch (error) { const duplicate=(error as {code?:string}).code==="23505"; return voiceJson({error:duplicate ? "A contact with this phone number already exists." : "Contact could not be saved."},duplicate ? 409 : 503); }
}
export async function DELETE(request:Request,context:Context) {
  const operator=await reviewOperator(request);
  if (operator instanceof Response) return operator;
  const {contactId}=await context.params;
  if (!contactIdPattern.test(contactId)) return voiceJson({error:"Invalid contact reference."},400);
  try { return await deleteContact(contactId,operator.userId) ? voiceJson({deleted:true}) : voiceJson({error:"Contact not found."},404); }
  catch { return voiceJson({error:"Contact could not be deleted."},503); }
}
