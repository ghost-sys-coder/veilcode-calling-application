import "server-only";
import { randomUUID } from "node:crypto";
import { reviewDatabase } from "@/lib/review-db";
import type { Contact, ContactInput, ContactPage } from "@/lib/contact-types";

const fields=`id,name,company,phone_number AS phone,country,notes,created_at AS "createdAt",updated_at AS "updatedAt"`;
type Row=Omit<Contact,"createdAt"|"updatedAt"> & {createdAt:Date;updatedAt:Date};
const serialize=(row:Row):Contact=>({...row,createdAt:new Date(row.createdAt).toISOString(),updatedAt:new Date(row.updatedAt).toISOString()});

export async function listContacts(operatorId:string, search:string, cursor?:{date:string;id:string}):Promise<ContactPage> {
  // Treat wildcard characters as literal text while keeping every value parameterized.
  const pattern=`%${search.replace(/[\\%_]/g,"\\$&")}%`;
  const result=await reviewDatabase().query<Row>(`SELECT ${fields} FROM veilcall_contacts
    WHERE operator_id=$1 AND ($2='' OR name ILIKE $3 OR company ILIKE $3 OR phone_number ILIKE $3)
    ${cursor ? "AND (updated_at,id)<($4::timestamptz,$5::uuid)" : ""}
    ORDER BY updated_at DESC,id DESC LIMIT 51`,cursor ? [operatorId,search,pattern,cursor.date,cursor.id] : [operatorId,search,pattern]);
  const items=result.rows.slice(0,50).map(serialize);
  const last=items.at(-1);
  return {items,nextCursor:result.rows.length>50 && last ? Buffer.from(JSON.stringify({date:last.updatedAt,id:last.id})).toString("base64url") : null};
}
export async function getContact(id:string,operatorId:string):Promise<Contact | null> {
  const result=await reviewDatabase().query<Row>(`SELECT ${fields} FROM veilcall_contacts WHERE id=$1 AND operator_id=$2`,[id,operatorId]);
  return result.rows[0] ? serialize(result.rows[0]) : null;
}
export async function createContact(operatorId:string,input:ContactInput):Promise<Contact> {
  const result=await reviewDatabase().query<Row>(`INSERT INTO veilcall_contacts(id,operator_id,name,company,phone_number,country,notes)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING ${fields}`,[randomUUID(),operatorId,input.name,input.company,input.phone,input.country,input.notes]);
  return serialize(result.rows[0]);
}
export async function updateContact(id:string,operatorId:string,input:ContactInput):Promise<Contact | null> {
  const result=await reviewDatabase().query<Row>(`UPDATE veilcall_contacts SET name=$3,company=$4,phone_number=$5,country=$6,notes=$7,updated_at=now()
    WHERE id=$1 AND operator_id=$2 RETURNING ${fields}`,[id,operatorId,input.name,input.company,input.phone,input.country,input.notes]);
  return result.rows[0] ? serialize(result.rows[0]) : null;
}
export async function deleteContact(id:string,operatorId:string):Promise<boolean> {
  const result=await reviewDatabase().query("DELETE FROM veilcall_contacts WHERE id=$1 AND operator_id=$2",[id,operatorId]);
  return result.rowCount===1;
}
