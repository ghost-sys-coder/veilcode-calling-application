import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./support/load-typescript.mjs";
const followupTypes=loadModule("../src/lib/followup-types.ts");
const followupValidation=loadModule("../src/lib/followup-validation.ts",{"@/lib/followup-types":followupTypes});
const validation=loadModule("../src/lib/reminder-validation.ts",{"@/lib/followup-validation":followupValidation});
const reviewValidation=loadModule("../src/lib/review-validation.ts");
const dashboardTypes=loadModule("../src/lib/dashboard-types.ts");
const dashboardValidation=loadModule("../src/lib/dashboard-validation.ts",{"@/lib/dashboard-types":dashboardTypes});
const callSid=`CA${"a".repeat(32)}`;
const context={params:Promise.resolve({callSid})};
const json=(body,status=200)=>Response.json(body,{status});

test("reminder actions require a valid revision, supported snooze and a real future time",()=>{
  const now=Date.parse("2026-10-24T10:00:00Z");
  for(const action of ["acknowledge","complete"])assert.deepEqual(validation.validateReminderAction({action,revision:2},now),{action,revision:2});
  for(const minutes of [15,60])assert.deepEqual(validation.validateReminderAction({action:"snooze",revision:1,minutes},now),{action:"snooze",revision:1,minutes});
  assert.deepEqual(validation.validateReminderAction({action:"reschedule",revision:1,callbackAt:"2026-10-25T12:00:00Z"},now),{action:"reschedule",revision:1,callbackAt:"2026-10-25T12:00:00.000Z"});
  for(const input of [null,{}, {action:"delete",revision:1},{action:"complete",revision:"1"},{action:"complete",revision:0},{action:"complete",revision:1.5},{action:"complete",revision:2147483647},{action:"snooze",revision:1,minutes:1},{action:"reschedule",revision:1,callbackAt:"2026-10-24T10:00:00Z"},{action:"reschedule",revision:1,callbackAt:"2026-02-30T12:00:00Z"},{action:"reschedule",revision:1,callbackAt:"2026-10-25T12:00"}])assert.equal(validation.validateReminderAction(input,now),null);
});

function actionRoute({operator={userId:"owner"},body={action:"complete",revision:1},changed=true,throws=false}={}) {
  let writes=0,authenticatedWithRequest=false;
  const route=loadModule("../src/app/api/voice/reminders/[callSid]/route.ts",{
    "@/lib/review-auth":{reviewOperator:async(request)=>{authenticatedWithRequest=request.method==="POST";return operator;},reviewBody:async()=>body},
    "@/lib/review-validation":reviewValidation,"@/lib/reminder-validation":validation,"@/lib/voice-responses":{voiceJson:json},
    "@/lib/reminder-store":{actOnReminder:async(sid,user,input)=>{writes++;assert.equal(sid,callSid);assert.equal(user,"owner");assert.deepEqual(input,body);if(throws)throw new Error("secret postgres details");return changed;}},
  });return {route,state:()=>({writes,authenticatedWithRequest})};
}
const request=()=>new Request("https://app.test/api/voice/reminders/"+callSid,{method:"POST"});
test("reminder mutations authenticate with origin checks before accessing storage",async()=>{
  for(const status of [401,403]){const {route,state}=actionRoute({operator:json({},status)});assert.equal((await route.POST(request(),context)).status,status);assert.deepEqual(state(),{writes:0,authenticatedWithRequest:true});}
});
test("malformed reminder actions and call references never reach storage",async()=>{
  const badBody=actionRoute({body:{action:"complete"}});assert.equal((await badBody.route.POST(request(),context)).status,400);assert.equal(badBody.state().writes,0);
  const badSid=actionRoute();assert.equal((await badSid.route.POST(request(),{params:Promise.resolve({callSid:"bad"})})).status,400);assert.equal(badSid.state().writes,0);
});
test("stale or foreign callbacks cannot be changed and uncertain writes expose no database details",async()=>{
  const stale=actionRoute({changed:false});assert.equal((await stale.route.POST(request(),context)).status,409);
  const error=await actionRoute({throws:true}).route.POST(request(),context);assert.equal(error.status,503);assert.doesNotMatch(await error.text(),/secret|postgres/);
  const saved=actionRoute();assert.equal((await saved.route.POST(request(),context)).status,200);assert.equal(saved.state().writes,1);
});
test("reminder reads are owner-scoped and reject invalid timezones before querying",async()=>{
  let reads=0;
  const route=loadModule("../src/app/api/voice/reminders/route.ts",{
    "@/lib/review-auth":{reviewOperator:async()=>({userId:"owner"})},"@/lib/dashboard-validation":dashboardValidation,"@/lib/voice-responses":{voiceJson:json},
    "@/lib/reminder-store":{getReminders:async(user,timezone)=>{reads++;assert.equal(user,"owner");assert.equal(timezone,"Australia/Sydney");return {items:[]};}},
  });
  assert.equal((await route.GET(new Request("https://app.test/api/voice/reminders?timezone=invalid"))).status,400);assert.equal(reads,0);
  assert.equal((await route.GET(new Request("https://app.test/api/voice/reminders?timezone=Australia%2FSydney"))).status,200);assert.equal(reads,1);
});
test("reminder reads deny unapproved sessions and sanitize database failures",async()=>{
  let reads=0;
  const route=(operator,throws=false)=>loadModule("../src/app/api/voice/reminders/route.ts",{
    "@/lib/review-auth":{reviewOperator:async()=>operator},"@/lib/dashboard-validation":dashboardValidation,"@/lib/voice-responses":{voiceJson:json},
    "@/lib/reminder-store":{getReminders:async()=>{reads++;if(throws)throw new Error("private connection details");return {}; }},
  });
  for(const status of [401,403])assert.equal((await route(json({},status)).GET(new Request("https://app.test/api/voice/reminders"))).status,status);
  assert.equal(reads,0);
  const failure=await route({userId:"owner"},true).GET(new Request("https://app.test/api/voice/reminders"));assert.equal(failure.status,503);assert.doesNotMatch(await failure.text(),/private connection/);
});
