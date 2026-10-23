import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {createRequire} from "node:module";
import pg from "pg";
import {loadModule} from "../tests/support/load-typescript.mjs";
createRequire(import.meta.url)("@next/env").loadEnvConfig(process.cwd());
const url=new URL(process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL);
if(process.env.DASHBOARD_TEST_HOST)url.hostname=process.env.DASHBOARD_TEST_HOST;
const client=new pg.Client({connectionString:url.toString(),connectionTimeoutMillis:20000});
const types=loadModule("../src/lib/dashboard-types.ts");
const store=loadModule("../src/lib/dashboard-store.ts",{"server-only":{},"@/lib/review-db":{reviewDatabase:()=>client},"@/lib/dashboard-types":types});
const user=`test_dashboard_${randomBytes(8).toString("hex")}`;
const ids=Array.from({length:7},()=>`CA${randomBytes(16).toString("hex")}`).sort();
try{
  await client.connect();await client.query("BEGIN");
  const phones=["+442079460121","+442079460121","+442079460122","+442079460123","+442079460124","+442079460125","+442079460125"];
  const statuses=["completed","completed","failed","initiated","completed","completed","completed"];
  const ratings=[5,3,null,null,1,null,null];
  for(let index=0;index<ids.length;index++)await client.query(`INSERT INTO veilcall_calls(call_sid,operator_id,to_number,country,status,rating,started_at)
    VALUES($1,$2,$3,'GB',$4,$5,((now() AT TIME ZONE 'Africa/Kampala')::date::timestamp AT TIME ZONE 'Africa/Kampala')-($6::int*interval '1 day'))`,[ids[index],user,phones[index],statuses[index],ratings[index],index===4 ? 8 : 0]);
  for(const [index,outcome]of[[0,"interested"],[1,"not_interested"],[4,"interested"],[5,"interested"],[6,"interested"]])await client.query("INSERT INTO veilcall_call_followups(call_sid,outcome) VALUES($1,$2)",[ids[index],outcome]);
  await client.query(`INSERT INTO veilcall_call_followups(call_sid,outcome,callback_at) VALUES
    ($1,'callback_needed',((now() AT TIME ZONE 'Africa/Kampala')::date::timestamp AT TIME ZONE 'Africa/Kampala')),
    ($2,'callback_needed',(((now() AT TIME ZONE 'Africa/Kampala')::date+1)::timestamp AT TIME ZONE 'Africa/Kampala'))`,[ids[2],ids[3]]);
  await client.query(`UPDATE veilcall_call_followups SET outcome='callback_needed',callback_at=now()-interval '2 days' WHERE call_sid=$1`,[ids[4]]);
  await client.query("INSERT INTO veilcall_contacts(id,operator_id,name,phone_number,country) VALUES($1,$2,'Owner contact',$3,'GB'),($4,$5,'Foreign contact',$3,'GB')",[randomUUID(),user,phones[2],randomUUID(),`${user}_other`]);
  const recording=()=>`RE${randomBytes(16).toString("hex")}`;
  await client.query(`INSERT INTO veilcall_recordings(recording_sid,call_sid,status,expires_at,consent_confirmed_at,deleted_at) VALUES
    ($1,$2,'completed',now()+interval '1 day',now(),NULL),($3,$4,'completed',now()-interval '1 day',now(),NULL),($5,$6,'completed',now()+interval '1 day',now(),now())`,[recording(),ids[0],recording(),ids[1],recording(),ids[5]]);
  const today=await store.getDashboard(user,"today","Africa/Kampala");
  assert.equal(today.calls,6);assert.equal(today.connected,4);assert.equal(today.finished,5);assert.equal(today.rated,2);assert.equal(today.averageRating,4);
  assert.equal(today.interested,1,"latest negative classification replaces earlier interest; repeated positive calls count one prospect");
  assert.equal(today.dueToday,1);assert.equal(today.overdue,2);assert.equal(today.callbacks.length,2,"old callbacks remain in today's attention queue");
  assert.equal(today.callbacks.find(item=>item.callSid===ids[2]).name,"Owner contact");
  assert.ok(!JSON.stringify(today).includes("Foreign contact"));
  assert.equal(today.recent.find(item=>item.callSid===ids[0]).hasAudio,true);
  assert.equal(today.recent.find(item=>item.callSid===ids[1]).hasAudio,false);
  assert.equal(today.recent.find(item=>item.callSid===ids[5]).hasAudio,false);
  const month=await store.getDashboard(user,"30d","Africa/Kampala");assert.equal(month.calls,7);assert.equal(month.rated,3);assert.equal(month.averageRating,3);assert.equal(month.dueToday,1);
  await client.query("UPDATE veilcall_call_followups SET completed_at=now() WHERE call_sid=$1",[ids[2]]);
  assert.equal((await store.getDashboard(user,"today","Africa/Kampala")).dueToday,0);
  const empty=await store.getDashboard(`${user}_other`,"today","Africa/Kampala");
  assert.equal(empty.calls,0);assert.equal(empty.averageRating,null);assert.equal(empty.finished,0);assert.equal(empty.dueToday,0);assert.deepEqual(empty.recent,[]);
  console.log("Dashboard storage passed: timezone periods, finished-call denominator, current interest per number, rating sample, callback independence, ownership, recording availability, empty states. All writes roll back.");
}catch(error){console.error(`Dashboard storage check failed (${error.code || error.name}). No credentials logged.`);if(error.name==="AssertionError")console.error(error.message);process.exitCode=1;}
finally{await client.query("ROLLBACK").catch(()=>{});await client.end();}
