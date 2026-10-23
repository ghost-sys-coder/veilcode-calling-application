import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createRequire} from "node:module";
import pg from "pg";
import {loadModule} from "../tests/support/load-typescript.mjs";
createRequire(import.meta.url)("@next/env").loadEnvConfig(process.cwd());
const url=new URL(process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL);if(process.env.CONTACT_IMPORT_TEST_HOST)url.hostname=process.env.CONTACT_IMPORT_TEST_HOST;
const client=new pg.Client({connectionString:url.toString(),connectionTimeoutMillis:20000});
const store=loadModule("../src/lib/contact-import-store.ts",{"server-only":{},"@/lib/review-db":{reviewDatabase:()=>client}});
const user=`test_import_${randomUUID()}`,foreign=`test_import_${randomUUID()}`;
const base={name:"Original",company:"Example",phone:"+442079460121",country:"GB",notes:"Keep these notes"};
try{
  await client.connect();await client.query("BEGIN");
  await store.importContacts(user,[base]);
  await store.importContacts(foreign,[{...base,name:"Foreign",phone:"+442079460122"}]);
  assert.deepEqual([...await store.existingContactPhones(user,[base.phone,"+442079460122"])],[base.phone]);
  const contacts=[{...base,name:"Do not overwrite"},{...base,name:"New GB",phone:"+442079460122"},{...base,name:"New AU",phone:"+61412345678",country:"AU"}];
  const result=await store.importContacts(user,contacts);assert.equal(result.size,2);assert.ok(!result.has(base.phone));
  assert.equal((await store.importContacts(user,contacts)).size,0,"retry does not create duplicates");
  const original=await client.query("SELECT name,notes FROM veilcall_contacts WHERE operator_id=$1 AND phone_number=$2",[user,base.phone]);assert.deepEqual(original.rows[0],{name:"Original",notes:base.notes});
  const other=await client.query("SELECT name FROM veilcall_contacts WHERE operator_id=$1 AND phone_number=$2",[foreign,"+442079460122"]);assert.equal(other.rows[0].name,"Foreign");
  await client.query("SAVEPOINT invalid_batch");
  await assert.rejects(store.importContacts(user,[{...base,phone:"+442079460123"},{...base,phone:"+442079460124",country:"XX"}]),error=>error.code==="23514");
  await client.query("ROLLBACK TO SAVEPOINT invalid_batch");
  assert.equal((await store.existingContactPhones(user,["+442079460123"])).size,0,"a failed statement leaves no partial contacts");
  console.log("Contact import storage passed: operator isolation, atomic bulk insert, duplicate protection, safe retries, original data preserved. All writes roll back.");
}catch(error){console.error(`Contact import storage check failed (${error.code || error.name}). No credentials logged.`);if(error.name==="AssertionError")console.error(error.message);process.exitCode=1;}
finally{await client.query("ROLLBACK").catch(()=>{});await client.end();}
