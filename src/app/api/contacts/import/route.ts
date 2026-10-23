import {reviewOperator} from "@/lib/review-auth";
import {validateImportRequest,mapImportRows,importReport} from "@/lib/contact-import";
import {existingContactPhones,importContacts} from "@/lib/contact-import-store";
import {voiceJson} from "@/lib/voice-responses";
export const runtime="nodejs";
const maxBodyBytes=2*1024*1024;
async function importBody(request:Request):Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json") || Number(request.headers.get("content-length") || 0)>maxBodyBytes) throw new Error("Choose a CSV file no larger than 512 KB.");
  const reader=request.body?.getReader();if (!reader) throw new Error("Choose a CSV file.");
  const chunks:Uint8Array[]=[];let length=0;
  try {while (true) {const {done,value}=await reader.read();if (done) break;length+=value.byteLength;if (length>maxBodyBytes) {await reader.cancel();throw new Error("The import request is too large. Use a CSV file no larger than 512 KB.");}chunks.push(value);}}
  finally {reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for (const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try {return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}catch {throw new Error("The import request could not be read. Choose a UTF-8 CSV and preview again.");}
}
export async function POST(request:Request) {
  const operator=await reviewOperator(request);if (operator instanceof Response) return operator;
  let validated;
  try {validated=validateImportRequest(await importBody(request));}
  catch(error){return voiceJson({error:error instanceof Error ? error.message : "Check the CSV file and mappings."},400);}
  const {request:input,document}=validated;
  try {
    const rows=mapImportRows(document,input.mapping,input.defaultCountry);
    const existing=await existingContactPhones(operator.userId,rows.flatMap((row)=>row.status==="ready" && row.contact ? [row.contact.phone] : []));
    for (const row of rows) if (row.status==="ready" && row.contact && existing.has(row.contact.phone)){row.status="duplicate";row.reason="This phone number is already in your contacts.";}
    if (input.action==="preview") return voiceJson(importReport(rows));
    const selected=new Set(input.selected);
    const ready=rows.filter((row)=>row.status==="ready" && selected.has(row.record));
    const inserted=await importContacts(operator.userId,ready.map((row)=>row.contact!));
    for (const row of rows) if (row.status==="ready") {
      if (!selected.has(row.record)) {row.status="skipped";row.reason="This record was not selected from the preview.";}
      else if (inserted.has(row.contact!.phone)) {row.status="imported";row.reason="Contact imported.";}
      else {row.status="duplicate";row.reason="This phone number was added to your contacts before the import finished.";}
    }
    return voiceJson(importReport(rows));
  } catch {return voiceJson({error:input.action==="preview" ? "The preview could not be loaded. Please retry." : "The import could not be confirmed. Check Contacts or retry; existing numbers will be skipped."},503);}
}
