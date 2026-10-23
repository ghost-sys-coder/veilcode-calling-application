import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./support/load-typescript.mjs";
const types=loadModule("../src/lib/followup-types.ts");
const validation=loadModule("../src/lib/followup-validation.ts",{"@/lib/followup-types":types});
const reviewValidation=loadModule("../src/lib/review-validation.ts");
const callSid=`CA${"a".repeat(32)}`;
const input={outcome:"callback_needed",callbackAt:"2026-11-10T09:30:00.000Z",note:" Call about the proposal. ",completed:false};
const json=(body,status=200)=>Response.json(body,{status});
test("follow-ups require a known outcome, explicit completion and a real UTC callback time",()=>{
  assert.deepEqual(validation.validateFollowUp(input),{...input,note:input.note.trim()});
  for (const value of [null,{}, {...input,outcome:"completed"},{...input,completed:1},{...input,note:"x".repeat(5001)},
    {...input,callbackAt:null},{...input,callbackAt:"2026-02-30T09:30:00Z"},{...input,callbackAt:"2026-11-10T09:30"},
    {...input,outcome:"interested"},{...input,outcome:"not_set",callbackAt:null,completed:true}]) assert.equal(validation.validateFollowUp(value),null);
  assert.ok(validation.validateFollowUp({...input,outcome:"interested",callbackAt:null}));
});
test("callback times round-trip in the operator's timezone and reject invalid dates",()=>{
  const old=process.env.TZ;process.env.TZ="Africa/Kampala";
  try {assert.equal(validation.localDateTime(input.callbackAt),"2026-11-10T12:30");assert.equal(validation.localToUtc("2026-11-10T12:30"),input.callbackAt);assert.equal(validation.localToUtc("2026-02-30T12:30"),null);}
  finally {if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
});
function detail({operator={userId:"user_test"},body=input,found=true}={}) {
  let reads=0,writes=0;
  const route=loadModule("../src/app/api/voice/followups/[callSid]/route.ts",{
    "@/lib/review-auth":{reviewOperator:async(request)=>{if(request)assert.equal(request.method,"PUT");return operator;},reviewBody:async()=>body},
    "@/lib/followup-validation":validation,"@/lib/review-validation":reviewValidation,"@/lib/voice-responses":{voiceJson:json},
    "@/lib/followup-store":{getFollowUp:async(sid,user)=>{assert.equal(sid,callSid);assert.equal(user,"user_test");reads++;return found ? {callSid} : null;},saveFollowUp:async(sid,user,data)=>{assert.equal(sid,callSid);assert.equal(user,"user_test");assert.equal(data.note,input.note.trim());writes++;return found;}},
  });return {route,counts:()=>({reads,writes})};
}
const context={params:Promise.resolve({callSid})};
test("outcome reads and writes authenticate before storage access",async()=>{
  for(const status of [401,403]) {const {route,counts}=detail({operator:json({},status)});for(const method of ["GET","PUT"])assert.equal((await route[method](new Request("https://app.test/record",{method}),context)).status,status);assert.deepEqual(counts(),{reads:0,writes:0});}
});
test("foreign calls stay unavailable and malformed outcomes never reach storage",async()=>{
  const foreign=detail({found:false});for(const method of ["GET","PUT"])assert.equal((await foreign.route[method](new Request("https://app.test/record",{method}),context)).status,404);
  const invalid=detail({body:{...input,callbackAt:null}});assert.equal((await invalid.route.PUT(new Request("https://app.test/record",{method:"PUT"}),context)).status,400);assert.equal(invalid.counts().writes,0);
  const badId=detail();assert.equal((await badId.route.PUT(new Request("https://app.test/record",{method:"PUT"}),{params:Promise.resolve({callSid:"invalid"})})).status,400);assert.equal(badId.counts().writes,0);
  const valid=detail();assert.equal((await valid.route.PUT(new Request("https://app.test/record",{method:"PUT"}),context)).status,200);
});
test("follow-up pages validate filters and cursors before querying and scope reads",async()=>{
  let reads=0;
  const route=loadModule("../src/app/api/voice/followups/route.ts",{
    "@/lib/review-auth":{reviewOperator:async()=>({userId:"user_test"})},"@/lib/review-validation":reviewValidation,"@/lib/voice-responses":{voiceJson:json},
    "@/lib/followup-store":{listFollowUps:async(user,view,cursor)=>{assert.equal(user,"user_test");assert.equal(view,"overdue");assert.equal(cursor.sid,callSid);reads++;return {items:[]};}},
  });
  for(const suffix of ["?view=unknown","?cursor=invalid",`?cursor=${"x".repeat(301)}`])assert.equal((await route.GET(new Request(`https://app.test/followups${suffix}`))).status,400);
  assert.equal(reads,0);
  const cursor=Buffer.from(JSON.stringify({date:input.callbackAt,sid:callSid})).toString("base64url");assert.equal((await route.GET(new Request(`https://app.test/followups?view=overdue&cursor=${cursor}`))).status,200);assert.equal(reads,1);
});
