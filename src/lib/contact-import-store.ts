import "server-only";
import {randomUUID} from "node:crypto";
import {reviewDatabase} from "@/lib/review-db";
import type {ContactInput} from "@/lib/contact-types";
export async function existingContactPhones(operatorId:string,phones:string[]):Promise<Set<string>> {
  if (!phones.length) return new Set();
  const result=await reviewDatabase().query<{phone:string}>("SELECT phone_number AS phone FROM veilcall_contacts WHERE operator_id=$1 AND phone_number=ANY($2::text[])",[operatorId,phones]);
  return new Set(result.rows.map((row)=>row.phone));
}
export async function importContacts(operatorId:string,contacts:ContactInput[]):Promise<Set<string>> {
  if (!contacts.length) return new Set();
  const values=contacts.map((contact)=>({...contact,id:randomUUID()}));
  const result=await reviewDatabase().query<{phone:string}>(`INSERT INTO veilcall_contacts(id,operator_id,name,company,phone_number,country,notes)
    SELECT (item->>'id')::uuid,$1,item->>'name',item->>'company',item->>'phone',item->>'country',item->>'notes'
    FROM jsonb_array_elements($2::jsonb) item
    ON CONFLICT(operator_id,phone_number) DO NOTHING RETURNING phone_number AS phone`,[operatorId,JSON.stringify(values)]);
  return new Set(result.rows.map((row)=>row.phone));
}
