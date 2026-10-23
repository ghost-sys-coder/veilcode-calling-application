import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import pg from "pg";
import { loadModule } from "../tests/support/load-typescript.mjs";
createRequire(import.meta.url)("@next/env").loadEnvConfig(process.cwd());
const client=new pg.Client({connectionString:process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL,connectionTimeoutMillis:15000});
const store=loadModule("../src/lib/contact-store.ts",{"server-only":{},"@/lib/review-db":{reviewDatabase:()=>client}});
const user=`user_contact_test_${randomUUID()}`;
const other=`user_contact_other_${randomUUID()}`;
const input={name:"Alex 100%",company:"Verification",country:"GB",phone:"+442079460123",notes:"'; DROP TABLE veilcall_contacts; --"};
try {
  await client.connect();await client.query("BEGIN");
  await client.query(await readFile(new URL("../migrations/002_contacts.sql",import.meta.url),"utf8"));
  const contact=await store.createContact(user,input);
  assert.equal((await store.getContact(contact.id,user)).notes,input.notes);
  assert.equal(await store.getContact(contact.id,other),null);
  assert.equal(await store.updateContact(contact.id,other,{...input,name:"Forbidden"}),null);
  assert.equal(await store.deleteContact(contact.id,other),false);
  await store.createContact(other,input);
  await client.query("SAVEPOINT duplicate_contact");
  await assert.rejects(store.createContact(user,input),(error)=>error.code==="23505");
  await client.query("ROLLBACK TO SAVEPOINT duplicate_contact");
  assert.equal((await store.listContacts(user,"100%")).items.length,1);
  assert.equal((await store.listContacts(other,"Alex")).items.length,1);
  assert.equal((await store.listContacts(user,"not present")).items.length,0);
  const rows=Array.from({length:52},(_,index)=>({id:randomUUID(),name:`Contact ${index}`,phone:`+44207946${String(1000+index)}`}));
  await client.query(`INSERT INTO veilcall_contacts(id,operator_id,name,phone_number,country)
    SELECT (item->>'id')::uuid,$1,item->>'name',item->>'phone','GB' FROM jsonb_array_elements($2::jsonb) item`,[user,JSON.stringify(rows)]);
  const first=await store.listContacts(user,"");
  assert.equal(first.items.length,50);assert.ok(first.nextCursor);
  const value=JSON.parse(Buffer.from(first.nextCursor,"base64url").toString());
  const second=await store.listContacts(user,"",value);
  assert.equal(second.items.length,3,"same-timestamp contacts are not skipped at page boundaries");
  assert.ok(!second.items.some((item)=>first.items.some((prior)=>prior.id===item.id)));
  assert.equal((await store.updateContact(contact.id,user,{...input,name:"Updated"})).name,"Updated");
  assert.equal(await store.deleteContact(contact.id,user),true);
  assert.equal(await store.getContact(contact.id,user),null);
  console.log("Contact storage passed: migration, owner isolation, normalization-ready storage, duplicate protection, literal search, pagination, edits, and deletion. All writes roll back.");
} catch {
  console.error("Contact storage check failed. Credentials were not logged; test writes roll back.");process.exitCode=1;
} finally {await client.query("ROLLBACK").catch(()=>{});await client.end();}
