import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import pg from "pg";
import { loadModule } from "../tests/support/load-typescript.mjs";
createRequire(import.meta.url)("@next/env").loadEnvConfig(process.cwd());
if (!process.env.WRAPUP_TEST_HOST) throw new Error("Set WRAPUP_TEST_HOST to an isolated database branch.");
const url=new URL(process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL);
url.hostname=process.env.WRAPUP_TEST_HOST;
const client=new pg.Client({connectionString:url.toString(),connectionTimeoutMillis:20000});
// Each application transaction is isolated in a savepoint inside a rollback-only fixture.
const database={query:(...args)=>client.query(...args),connect:async()=>({
  query:(sql,...args)=>client.query(sql==="BEGIN" ? "SAVEPOINT wrapup" : sql==="COMMIT" ? "RELEASE SAVEPOINT wrapup" : sql==="ROLLBACK" ? "ROLLBACK TO SAVEPOINT wrapup" : sql,...args),release:()=>{},
})};
const deps={"server-only":{},"@/lib/review-db":{reviewDatabase:()=>database}};
const followUps=loadModule("../src/lib/followup-store.ts",deps);
const store=loadModule("../src/lib/call-wrapup-store.ts",{...deps,"@/lib/followup-store":followUps});
const sid=()=>`CA${randomBytes(16).toString("hex")}`;
const callSid=sid(),otherCall=sid(),user=`test_wrapup_${randomBytes(8).toString("hex")}`;
const input={outcome:"callback_needed",callbackAt:"2099-01-01T09:30:12.123Z",note:"Next conversation",completed:false,rating:4,expectedRating:null,expectedRevision:0};
try {
  await client.connect();await client.query("BEGIN");
  for (const file of ["003_call_followups.sql","004_callback_reminders.sql","005_callback_email.sql"]) await client.query(await readFile(new URL("../migrations/"+file,import.meta.url),"utf8"));
  await client.query("INSERT INTO veilcall_calls(call_sid,operator_id,to_number,notes,status,bookmarks) VALUES($1,$3,'+442079460123','Existing quality notes','completed',$5::jsonb),($2,$4,'+61412345678','','completed','[]')",[callSid,otherCall,user,user+"_other",JSON.stringify([{id:"old",seconds:10,note:"Keep",recordingSid:`RE${"a".repeat(32)}`}])]);
  const empty=await store.getCallWrapUp(callSid,user);assert.equal(empty.revision,0);assert.equal(empty.rating,null);
  assert.equal(await store.getCallWrapUp(otherCall,user),null);assert.equal(await store.saveCallWrapUp(otherCall,user,input),null);
  let saved=await store.saveCallWrapUp(callSid,user,input);
  assert.equal(saved.revision,1);assert.equal(saved.rating,4);assert.equal(saved.callbackAt,input.callbackAt);
  assert.equal(await store.saveCallWrapUp(callSid,user,input),"conflict");
  const preserved=await client.query("SELECT notes,bookmarks,status FROM veilcall_calls WHERE call_sid=$1",[callSid]);
  assert.equal(preserved.rows[0].notes,"Existing quality notes");assert.equal(preserved.rows[0].bookmarks[0].note,"Keep");assert.equal(preserved.rows[0].status,"completed");
  // A note/rating edit must not schedule a duplicate email or un-dismiss the alert.
  await client.query("UPDATE veilcall_call_followups SET reminder_ack_revision=revision WHERE call_sid=$1",[callSid]);
  saved=await store.saveCallWrapUp(callSid,user,{...input,note:"Updated note",rating:5,expectedRating:4,expectedRevision:1});
  assert.equal(saved.revision,2);
  let versions=await client.query("SELECT revision,email_schedule_version,reminder_ack_revision FROM veilcall_call_followups WHERE call_sid=$1",[callSid]);
  assert.deepEqual(versions.rows[0],{revision:2,email_schedule_version:1,reminder_ack_revision:2});
  // Edits through the existing follow-up editor invalidate a stale dialer draft.
  await followUps.saveFollowUp(callSid,user,{...input,note:"Other tab"});
  assert.equal(await store.saveCallWrapUp(callSid,user,{...input,expectedRating:5,expectedRevision:2}),"conflict");
  assert.equal((await store.getCallWrapUp(callSid,user)).note,"Other tab");
  assert.equal((await store.getCallWrapUp(callSid,user)).rating,5);
  assert.equal(await store.saveCallWrapUp(callSid,user,{...input,expectedRating:4,expectedRevision:3}),"conflict");
  // Failure after the rating update must roll the whole write back.
  const failing=loadModule("../src/lib/call-wrapup-store.ts",{...deps,"@/lib/followup-store":{saveFollowUp:async()=>{throw new Error("Injected follow-up failure");}}});
  await assert.rejects(failing.saveCallWrapUp(callSid,user,{...input,rating:1,expectedRating:5,expectedRevision:3}));
  assert.equal((await store.getCallWrapUp(callSid,user)).rating,5);
  saved=await store.saveCallWrapUp(callSid,user,{...input,callbackAt:"2099-01-02T10:00:00.000Z",expectedRating:5,expectedRevision:3});
  versions=await client.query("SELECT email_schedule_version,reminder_ack_revision FROM veilcall_call_followups WHERE call_sid=$1",[callSid]);
  assert.deepEqual(versions.rows[0],{email_schedule_version:2,reminder_ack_revision:null});assert.equal(saved.revision,4);
  console.log("Call wrap-up storage passed: ownership, atomic saves and rollback, stale edits, quality/bookmark preservation and reminder versions. All fixtures roll back.");
} catch(error) {console.error(`Call wrap-up storage check failed (${error.code || error.name}): ${error.name==="AssertionError" ? error.message : "No credentials logged."}`);process.exitCode=1;}
finally {await client.query("ROLLBACK").catch(()=>{});await client.end();}
