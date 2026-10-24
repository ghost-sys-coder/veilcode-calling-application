import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import pg from "pg";
import { loadModule } from "../tests/support/load-typescript.mjs";
createRequire(import.meta.url)("@next/env").loadEnvConfig(process.cwd());
if (!process.env.REMINDER_TEST_HOST) throw new Error("Set REMINDER_TEST_HOST to an isolated validation branch.");
const url=new URL(process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL);
url.hostname=process.env.REMINDER_TEST_HOST;
const client=new pg.Client({connectionString:url.toString(),connectionTimeoutMillis:20000});
const imports={"server-only":{},"@/lib/review-db":{reviewDatabase:()=>client}};
const store=loadModule("../src/lib/reminder-store.ts",imports);
const followups=loadModule("../src/lib/followup-store.ts",imports);
const sid=()=>`CA${randomBytes(16).toString("hex")}`;
const owner=`test_reminder_${randomBytes(8).toString("hex")}`,foreign=`${owner}_other`;
const input={outcome:"callback_needed",callbackAt:"2026-01-01T00:00:00.000Z",note:"Preserve callback note",completed:false};
const callSid=sid(),other=sid();
const current=async()=> (await store.getReminders(owner,"Africa/Kampala")).items.find((item)=>item.callSid===callSid);
try {
  await client.connect();await client.query("BEGIN");
  const migration=await readFile(new URL("../migrations/004_callback_reminders.sql",import.meta.url),"utf8");
  await client.query(migration);await client.query(migration);
  await client.query(await readFile(new URL("../migrations/005_callback_email.sql",import.meta.url),"utf8"));
  await client.query("INSERT INTO veilcall_calls(call_sid,operator_id,to_number,country,notes,rating) VALUES($1,$3,'+442079460123','GB','Quality note',5),($2,$4,'+442079460123','GB','',NULL)",[callSid,other,owner,foreign]);
  await followups.saveFollowUp(callSid,owner,input);await followups.saveFollowUp(other,foreign,input);
  assert.equal((await store.getReminders(owner,"Africa/Kampala")).pendingCount,1);
  assert.equal(await store.actOnReminder(other,owner,{action:"complete",revision:1}),false);
  assert.equal(await store.actOnReminder(callSid,foreign,{action:"snooze",revision:1,minutes:15}),false);
  assert.equal(await store.actOnReminder(callSid,owner,{action:"acknowledge",revision:1}),true);
  assert.equal((await store.getReminders(owner,"Africa/Kampala")).pendingCount,0);
  assert.equal((await store.getReminders(owner,"Africa/Kampala")).attentionCount,1);
  assert.equal((await current()).acknowledged,true);
  // Notes-only saves retain dismissal, but invalidate stale actions.
  await followups.saveFollowUp(callSid,owner,{...input,note:"Updated note"});
  assert.equal((await current()).acknowledged,true);
  assert.equal(await store.actOnReminder(callSid,owner,{action:"complete",revision:1}),false);
  const rev=(await current()).revision;
  const stamp=Date.now();assert.equal(await store.actOnReminder(callSid,owner,{action:"snooze",revision:rev,minutes:15}),true);
  const snoozed=await followups.getFollowUp(callSid,owner);
  assert.ok(Date.parse(snoozed.callbackAt)>stamp+14*60000 && Date.parse(snoozed.callbackAt)<Date.now()+16*60000);
  assert.equal(snoozed.note,"Updated note");assert.equal((await store.getReminders(owner,"Africa/Kampala")).pendingCount,0);
  assert.equal(await store.actOnReminder(callSid,owner,{action:"snooze",revision:rev,minutes:15}),false);
  assert.equal(await store.actOnReminder(callSid,owner,{action:"reschedule",revision:rev+1,callbackAt:"2001-01-01T00:00:00Z"}),false);
  await followups.saveFollowUp(callSid,owner,input);
  const updated=await current();assert.equal(updated.acknowledged,false);
  assert.equal(await store.actOnReminder(callSid,owner,{action:"reschedule",revision:updated.revision,callbackAt:"2099-01-01T00:00:00Z"}),true);
  assert.equal((await store.getReminders(owner,"Africa/Kampala")).attentionCount,0);
  await followups.saveFollowUp(callSid,owner,input);
  assert.equal(await store.actOnReminder(callSid,owner,{action:"complete",revision:(await current()).revision}),true);
  assert.equal((await store.getReminders(owner,"Africa/Kampala")).attentionCount,0);
  await followups.saveFollowUp(callSid,owner,input);
  assert.equal((await store.getReminders(owner,"Africa/Kampala")).pendingCount,1);
  // Counts are not limited to the displayed 20; pending items outrank dismissed.
  const ids=Array.from({length:25},sid);
  await client.query("INSERT INTO veilcall_calls(call_sid,operator_id) SELECT value,$1 FROM jsonb_array_elements_text($2::jsonb)",[owner,JSON.stringify(ids)]);
  await client.query("INSERT INTO veilcall_call_followups(call_sid,outcome,callback_at,reminder_ack_revision) SELECT value,'callback_needed','2000-01-01T00:00:00Z',1 FROM jsonb_array_elements_text($1::jsonb)",[JSON.stringify(ids)]);
  const summary=await store.getReminders(owner,"Africa/Kampala");assert.equal(summary.items.length,20);assert.equal(summary.attentionCount,26);assert.equal(summary.pendingCount,1);assert.equal(summary.items[0].callSid,callSid);
  // A callback exactly at local midnight tomorrow is excluded (DST-safe).
  for(const timezone of ["Africa/Kampala","Europe/London","Australia/Sydney","America/New_York"]){
    const boundary=(await client.query("SELECT (((now() AT TIME ZONE $1)::date+1)::timestamp AT TIME ZONE $1) AS tomorrow",[timezone])).rows[0].tomorrow;
    const boundaryCall=sid();await client.query("INSERT INTO veilcall_calls(call_sid,operator_id) VALUES($1,$2)",[boundaryCall,owner]);
    await followups.saveFollowUp(boundaryCall,owner,{...input,callbackAt:boundary.toISOString()});
    assert.equal((await store.getReminders(owner,timezone)).attentionCount,26);
    await followups.saveFollowUp(boundaryCall,owner,{...input,callbackAt:new Date(boundary.getTime()-1).toISOString()});
    assert.equal((await store.getReminders(owner,timezone)).attentionCount,27);
    await followups.saveFollowUp(boundaryCall,owner,{...input,completed:true});
  }
  assert.deepEqual((await client.query("SELECT notes,rating FROM veilcall_calls WHERE call_sid=$1",[callSid])).rows[0],{notes:"Quality note",rating:5});
  console.log("Reminder storage passed: idempotent migration, owner isolation, persistent dismissal, note preservation, snooze timing, stale actions, reschedule, completion/reopen, full counts, bounded priority list, and timezone boundaries. All test writes roll back.");
} catch(error) {console.error(`Reminder storage check failed (${error.code || error.name}): ${error instanceof assert.AssertionError ? error.message : "No database details logged."}`);process.exitCode=1;}
finally {await client.query("ROLLBACK").catch(()=>{});await client.end();}
