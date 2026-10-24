import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./support/load-typescript.mjs";
const followUp=loadModule("../src/lib/followup-validation.ts",{"@/lib/followup-types":loadModule("../src/lib/followup-types.ts")});
const validation=loadModule("../src/lib/call-wrapup.ts",{"@/lib/followup-validation":followUp});
const callSid=`CA${"a".repeat(32)}`;
const input={outcome:"callback_needed",callbackAt:"2099-01-01T09:30:12.123Z",note:" Next step ",completed:false,rating:4,expectedRating:null,expectedRevision:0};
const json=(value,status=200)=>Response.json(value,{status});
const context={params:Promise.resolve({callSid})};
class ReviewError extends Error {constructor(message,status){super(message);this.status=status;}}

test("call wrap-up validates rating, callback, note and concurrency baselines",()=>{
  assert.deepEqual(validation.validateWrapUp(input),{...input,note:"Next step"});
  for (const value of [null,{}, {...input,rating:0},{...input,rating:1.5},{...input,rating:"5"},{...input,expectedRating:undefined},
    {...input,expectedRevision:-1},{...input,expectedRevision:"0"},{...input,expectedRevision:NaN},{...input,expectedRevision:1.5},
    {...input,callbackAt:"2026-02-30T10:00:00Z"},{...input,note:"a".repeat(5001)},{...input,outcome:"interested"}]) assert.equal(validation.validateWrapUp(value),null);
  assert.ok(validation.validateWrapUp({...input,outcome:"interested",callbackAt:null,rating:null}));
});

function route({auth={userId:"user_test"},body=input,record={callSid,phone:"+442079460123"},result=record,fail=false,providerError=false}={}) {
  const events=[];
  const handlers=loadModule("../src/app/api/voice/calls/[callSid]/wrapup/route.ts",{
    "@/lib/review-auth":{reviewOperator:async(request)=>{events.push(request ? "auth:origin" : "auth");return auth;},reviewBody:async()=>{events.push("body");return body;}},
    "@/lib/call-wrapup":validation,"@/lib/review-validation":{callSidPattern:/^CA[0-9a-f]{32}$/},"@/lib/voice-responses":{voiceJson:json},
    "@/lib/review-service":{ReviewError,ownedProviderCall:async(sid,user)=>{events.push(["provider",sid,user]);if (providerError) throw new ReviewError("Call not found.",404);}},
    "@/lib/call-wrapup-store":{
      getCallWrapUp:async(sid,user)=>{events.push(["get",sid,user]);if(fail)throw new Error("private database error");return record;},
      saveCallWrapUp:async(sid,user,value)=>{events.push(["save",sid,user,value]);if(fail)throw new Error("private database error");return result;},
    },
  });
  return {handlers,events};
}
const request=(method="GET")=>new Request("https://app.test/api/voice/calls/"+callSid+"/wrapup",{method});

test("wrap-up routes authenticate before parsing or accessing provider and database",async()=>{
  for(const status of [401,403]) {
    const {handlers,events}=route({auth:json({error:"Denied"},status)});
    assert.equal((await handlers.GET(request(),context)).status,status);
    assert.equal((await handlers.PUT(request("PUT"),context)).status,status);
    assert.deepEqual(events,["auth","auth:origin"]);
  }
});
test("wrap-up scopes calls to the operator, recovers delayed tracking and rejects foreign calls",async()=>{
  const found=route();
  assert.equal((await found.handlers.GET(request(),context)).status,200);
  assert.deepEqual(found.events,["auth",["get",callSid,"user_test"]]);
  const missing=route({record:null,providerError:true});
  assert.equal((await missing.handlers.GET(request(),context)).status,404);
  assert.deepEqual(missing.events,["auth",["get",callSid,"user_test"],["provider",callSid,"user_test"]]);
  const delayed=route({record:null});
  assert.equal((await delayed.handlers.GET(request(),context)).status,404);
  assert.equal(delayed.events.filter(event=>Array.isArray(event) && event[0]==="get").length,2);
});
test("wrap-up rejects malformed input and identifiers, reports stale edits and hides storage failures",async()=>{
  const malformed=route({body:{...input,rating:8}});
  assert.equal((await malformed.handlers.PUT(request("PUT"),context)).status,400);
  assert.ok(!malformed.events.some(event=>Array.isArray(event)));
  const invalid=route();
  assert.equal((await invalid.handlers.GET(request(),{params:Promise.resolve({callSid:"invalid"})})).status,400);
  assert.equal((await invalid.handlers.PUT(request("PUT"),{params:Promise.resolve({callSid:"invalid"})})).status,400);
  for(const [result,status] of [["conflict",409],[null,404],[{callSid},200]]) {
    const fixture=route({result});const response=await fixture.handlers.PUT(request("PUT"),context);
    assert.equal(response.status,status);assert.deepEqual(fixture.events[2],["save",callSid,"user_test",{...input,note:"Next step"}]);
  }
  const failed=route({fail:true});
  for (const method of ["GET","PUT"]) {
    const response=await failed.handlers[method](request(method),context);
    assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/private database/);
  }
});

test("recording readiness follows the recipient leg, even if browser leg is active",async()=>{
  for (const [status,canRecord] of [["ringing",false],["queued",false],["completed",false],["in-progress",true],[undefined,false]]) {
    const recordingRoute=loadModule("../src/app/api/voice/recordings/route.ts",{
      "@/lib/review-auth":{reviewOperator:async()=>({userId:"user_test"})},"@/lib/voice-responses":{voiceJson:json},
      "@/lib/review-validation":{callSidPattern:/^CA[0-9a-f]{32}$/},
      "@/lib/review-service":{ReviewError,ownedProviderCall:async()=>({parent:{status:"in-progress"},child:status ? {status} : undefined}),reconcileRecordings:async()=>({recordings:[]})},
    });
    const response=await recordingRoute.GET(new Request(`https://app.test/recordings?callSid=${callSid}`));
    assert.equal(response.status,200);const data=await response.json();assert.equal(data.canRecord,canRecord);assert.equal(data.callStatus,status ?? "pending");
  }
});
