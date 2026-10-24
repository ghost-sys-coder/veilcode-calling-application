import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { loadModule } from "./support/load-typescript.mjs";
const require = createRequire(import.meta.url);
const callSid = `CA${"a".repeat(32)}`;
const recordingSid = `RE${"b".repeat(32)}`;
const otherSid = `RE${"c".repeat(32)}`;
const accountSid = `AC${"d".repeat(32)}`;
const validation = loadModule("../src/lib/review-validation.ts");
const json = (data,status=200) => Response.json(data,{status});

test("review input rejects invalid ratings, oversized notes and malformed bookmarks", () => {
  const valid = { notes:"Good opening",rating:4,bookmarks:[{id:"bookmark-1",recordingSid,seconds:12,note:"Audio gap"}] };
  assert.deepEqual(validation.validateReviewInput(valid),valid);
  for (const input of [null,{}, {...valid,rating:6}, {...valid,rating:1.5}, {...valid,notes:"a".repeat(10001)},
    {...valid,bookmarks:[{...valid.bookmarks[0],seconds:-1}]}, {...valid,bookmarks:[{...valid.bookmarks[0],seconds:NaN}]},
    {...valid,bookmarks:[{...valid.bookmarks[0],recordingSid:"invalid"}]}, {...valid,bookmarks:[valid.bookmarks[0],valid.bookmarks[0]]}]) {
    assert.equal(validation.validateReviewInput(input),null);
  }
});
test("recordings are inaccessible while processing, expired or deleted", () => {
  const recording = {status:"completed",expiresAt:new Date(Date.now()+60000).toISOString(),deletedAt:null};
  assert.equal(validation.recordingAccessible(recording),true);
  assert.equal(validation.recordingAccessible({...recording,status:"processing"}),false);
  assert.equal(validation.recordingAccessible({...recording,deletedAt:new Date().toISOString()}),false);
  assert.equal(validation.recordingAccessible({...recording,expiresAt:new Date(0).toISOString()}),false);
});
test("retention configuration rejects invalid day counts", () => {
  const previous = process.env.RECORDING_RETENTION_DAYS;
  try {
    for (const value of ["0","366","1.5","invalid"]) { process.env.RECORDING_RETENTION_DAYS=value; assert.throws(() => validation.retentionDays()); }
    delete process.env.RECORDING_RETENTION_DAYS;
    assert.equal(validation.retentionDays(),30);
  } finally { if (previous===undefined) delete process.env.RECORDING_RETENTION_DAYS; else process.env.RECORDING_RETENTION_DAYS=previous; }
});

test("review authentication requires a session, approved operator and same-origin mutations", async () => {
  for (const [userId,approved,origin,expected] of [[null,true,null,401],["user_test",false,null,403],["user_test",true,"https://other.test",403]]) {
    const auth = loadModule("../src/lib/review-auth.ts",{
      "server-only":{},"@clerk/nextjs/server":{auth:async()=>({userId})},"@/lib/access":{operatorHasAccess:()=>approved},
      "@/lib/voice-responses":{voiceJson:json,isSameOrigin:(r)=>r.headers.get("origin")===new URL(r.url).origin},
    });
    const response = await auth.reviewOperator(origin ? new Request("https://app.test/api",{headers:{origin}}) : undefined);
    assert.equal(response.status,expected);
  }
});

function recordingService({owner="user_test",answered=true,active=null,lease=true,processingRead=false,failUpdate=false}={}) {
  const events=[];
  let stored=active ? [{...active,expiresAt:new Date(Date.now()+86400000).toISOString(),deletedAt:null}] : [];
  let provider=active ? [active] : [];
  let updateFailed=false;
  const calls=()=>({fetch:async()=>({from:`client:${owner}`,parentCallSid:null,startTime:new Date(),dateCreated:new Date(),status:"in-progress"}),
    recordings:Object.assign((sid)=>({update:async(options)=>{events.push(`update:${options.status}`);if (failUpdate && !updateFailed) {updateFailed=true;throw new Error("Uncertain provider response");} const record={...provider.find((r)=>r.sid===sid),status:options.status};provider=[record];return record;}}),{
      list:async()=>processingRead ? provider.map(item=>({...item,status:["in-progress","paused"].includes(item.status) ? "processing" : item.status})) : provider,
      create:async()=>{events.push("create");const record={sid:recordingSid,callSid,status:"in-progress",duration:"0",channels:2,dateCreated:new Date()};provider=[record];return record;},
    })});
  calls.list=async()=>[{to:"+61412345678",from:"+12125550123",status:answered ? "in-progress" : "ringing",duration:"0"}];
  const service = loadModule("../src/lib/review-service.ts",{
    "server-only":{},"@/lib/voice-service":{voiceService:()=>({calls}),voiceWebhookUrl:()=>"https://app.test/api/voice/recordings/callback"},
    "@/lib/review-store":{
      storeCall:async()=>{},
      getReview:async()=>({recordings:stored}),
      acquireRecordingLease:async(_sid,_user,consent)=>{events.push(consent ? "consent" : "lease");return lease ? "token" : null;},
      releaseRecordingLease:async()=>{events.push("release");},
      storeRecording:async(record)=>{stored=[{...record,expiresAt:new Date(Date.now()+86400000).toISOString(),deletedAt:null}];},
      getOwnedRecording:async()=>({callSid,expiresAt:new Date(Date.now()+86400000).toISOString(),deletedAt:null}),
      tombstoneRecording:async()=>{},finishRecordingDeletion:async()=>{},
    },
  });
  return {service,events};
}
test("recording cannot start for another operator, before answer, or without consent", async () => {
  for (const [options,input,status] of [[{owner:"user_other"},{consentConfirmed:true},404],[{answered:false},{consentConfirmed:true},409],[{},{consentConfirmed:false},400]]) {
    const {service,events}=recordingService(options);
    const old=process.env.VOICE_RECORDING_ENABLED;process.env.VOICE_RECORDING_ENABLED="true";
    try { await assert.rejects(service.controlRecording({callSid,action:"start",...input},"user_test"),(error)=>error.status===status); assert.ok(!events.includes("create")); }
    finally { if(old===undefined)delete process.env.VOICE_RECORDING_ENABLED;else process.env.VOICE_RECORDING_ENABLED=old; }
  }
});

test("recording controls retain confirmed in-flight state when Twilio reads report processing",async()=>{
  const old=process.env.VOICE_RECORDING_ENABLED;process.env.VOICE_RECORDING_ENABLED="true";
  try {
    for (const action of ["pause","resume","stop"]) {
      const {service,events}=recordingService({active:{sid:recordingSid,callSid,status:action==="resume" ? "paused" : "in-progress",dateCreated:new Date(),channels:2},processingRead:true});
      await service.controlRecording({callSid,action,recordingSid,consentConfirmed:true},"user_test");
      assert.ok(events.includes(`update:${action==="pause" ? "paused" : action==="resume" ? "in-progress" : "stopped"}`));
    }
    const duplicate=recordingService({active:{sid:recordingSid,callSid,status:"paused",dateCreated:new Date(),channels:2},processingRead:true});
    await assert.rejects(duplicate.service.controlRecording({callSid,action:"start",consentConfirmed:true},"user_test"),error=>error.status===409);
    assert.ok(!duplicate.events.includes("create"));
  } finally {if (old===undefined)delete process.env.VOICE_RECORDING_ENABLED;else process.env.VOICE_RECORDING_ENABLED=old;}
});

test("an uncertain resume attempts to stop recording and releases its lease",async()=>{
  const old=process.env.VOICE_RECORDING_ENABLED;process.env.VOICE_RECORDING_ENABLED="true";
  try {
    const {service,events}=recordingService({active:{sid:recordingSid,callSid,status:"paused",dateCreated:new Date(),channels:2},failUpdate:true});
    await assert.rejects(service.controlRecording({callSid,action:"resume",recordingSid,consentConfirmed:true},"user_test"));
    assert.ok(events.includes("update:stopped"));assert.ok(events.includes("release"));
  } finally {if (old===undefined)delete process.env.VOICE_RECORDING_ENABLED;else process.env.VOICE_RECORDING_ENABLED=old;}
});
test("recording consent is stored before creation and leases prevent duplicate starts", async () => {
  const old=process.env.VOICE_RECORDING_ENABLED;process.env.VOICE_RECORDING_ENABLED="true";
  try {
    const {service,events}=recordingService();
    await service.controlRecording({callSid,action:"start",consentConfirmed:true},"user_test");
    assert.ok(events.indexOf("consent")<events.indexOf("create"));assert.ok(events.includes("release"));
    const locked=recordingService({lease:false});
    await assert.rejects(locked.service.controlRecording({callSid,action:"start",consentConfirmed:true},"user_test"),(error)=>error.status===409);
    assert.ok(!locked.events.includes("create"));
    const duplicate=recordingService({active:{sid:recordingSid,callSid,status:"paused"}});
    await assert.rejects(duplicate.service.controlRecording({callSid,action:"start",consentConfirmed:true},"user_test"),(error)=>error.status===409);
    assert.ok(!duplicate.events.includes("create"));assert.ok(duplicate.events.includes("release"));
  } finally {if(old===undefined)delete process.env.VOICE_RECORDING_ENABLED;else process.env.VOICE_RECORDING_ENABLED=old;}
});
test("pause and stop still work when new recordings are disabled; resume requires consent", async () => {
  const old=process.env.VOICE_RECORDING_ENABLED;process.env.VOICE_RECORDING_ENABLED="false";
  try {
    for (const action of ["pause","stop"]) {
      const {service,events}=recordingService({active:{sid:recordingSid,callSid,status:"in-progress",dateCreated:new Date(),channels:2}});
      await service.controlRecording({callSid,action,recordingSid},"user_test");
      assert.ok(events.includes(`update:${action==="pause" ? "paused" : "stopped"}`));
    }
    const {service}=recordingService({active:{sid:recordingSid,callSid,status:"paused"}});
    await assert.rejects(service.controlRecording({callSid,action:"resume",recordingSid,consentConfirmed:true},"user_test"),(error)=>error.status===503);
    process.env.VOICE_RECORDING_ENABLED="true";
    await assert.rejects(service.controlRecording({callSid,action:"resume",recordingSid,consentConfirmed:false},"user_test"),(error)=>error.status===400);
  } finally {if(old===undefined)delete process.env.VOICE_RECORDING_ENABLED;else process.env.VOICE_RECORDING_ENABLED=old;}
});

function mediaRoute(recording,authenticated=true) {
  return loadModule("../src/app/api/voice/recordings/[recordingSid]/media/route.ts",{
    "@/lib/review-auth":{reviewOperator:async()=>authenticated ? {userId:"user_test"} : json({error:"Sign in"},401)},
    "@/lib/review-store":{getOwnedRecording:async()=>recording},"@/lib/review-validation":validation,"@/lib/voice-responses":{voiceJson:json},
  }).GET;
}
test("private playback denies unauthenticated, foreign, expired and deleted recordings", async () => {
  const ready={status:"completed",expiresAt:new Date(Date.now()+60000).toISOString(),deletedAt:null};
  const context={params:Promise.resolve({recordingSid})};
  assert.equal((await mediaRoute(ready,false)(new Request("https://app.test/audio"),context)).status,401);
  for (const [record,status] of [[null,404],[{...ready,deletedAt:new Date().toISOString()},410],[{...ready,expiresAt:new Date(0).toISOString()},410],[{...ready,status:"processing"},410]]) {
    assert.equal((await mediaRoute(record)(new Request("https://app.test/audio"),context)).status,status);
  }
  assert.equal((await mediaRoute(ready)(new Request("https://app.test/audio",{headers:{range:"bytes=0-1,10-20"}}),context)).status,416);
});
test("private playback forwards ranges and keeps provider credentials on the server", async (context) => {
  const keys=["TWILIO_ACCOUNT_SID","TWILIO_API_KEY_SID","TWILIO_API_KEY_SECRET"];
  const old=keys.map((key)=>process.env[key]);
  try {
    process.env.TWILIO_ACCOUNT_SID=accountSid;process.env.TWILIO_API_KEY_SID="test-key";process.env.TWILIO_API_KEY_SECRET="test-secret";
    let requested;
    context.mock.method(globalThis,"fetch",async(url,options)=>{requested={url,options};return new Response("fake-audio",{status:206,headers:{"content-range":"bytes 0-9/10","content-length":"10"}});});
    const response=await mediaRoute({status:"completed",expiresAt:new Date(Date.now()+60000).toISOString(),deletedAt:null})(new Request("https://app.test/audio?download=1",{headers:{range:"bytes=0-9"}}),{params:Promise.resolve({recordingSid})});
    assert.equal(response.status,206);assert.equal(requested.options.headers.Range,"bytes=0-9");
    assert.ok(requested.url.startsWith(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}`));
    assert.match(response.headers.get("cache-control"),/no-store/);assert.equal(response.headers.get("authorization"),null);
    assert.match(response.headers.get("content-disposition"),/attachment/);assert.equal(await response.text(),"fake-audio");
  } finally {keys.forEach((key,i)=>{if(old[i]===undefined)delete process.env[key];else process.env[key]=old[i];});}
});

test("private playback retries unavailable dual-channel audio as mono and preserves range errors", async (context) => {
  const keys=["TWILIO_ACCOUNT_SID","TWILIO_API_KEY_SID","TWILIO_API_KEY_SECRET"];
  const old=keys.map((key)=>process.env[key]);
  try {
    process.env.TWILIO_ACCOUNT_SID=accountSid;process.env.TWILIO_API_KEY_SID="test-key";process.env.TWILIO_API_KEY_SECRET="test-secret";
    const requested=[];
    context.mock.method(globalThis,"fetch",async(url)=>{
      requested.push(url);
      return requested.length===1 ? new Response("Dual audio unavailable",{status:400})
        : new Response(null,{status:416,headers:{"content-range":"bytes */100"}});
    });
    const response=await mediaRoute({status:"completed",channels:2,expiresAt:new Date(Date.now()+60000).toISOString(),deletedAt:null})(new Request("https://app.test/audio",{headers:{range:"bytes=200-"}}),{params:Promise.resolve({recordingSid})});
    assert.equal(requested.length,2);assert.match(requested[0],/RequestedChannels=2$/);assert.match(requested[1],/RequestedChannels=1$/);
    assert.equal(response.status,416);assert.equal(response.headers.get("content-range"),"bytes */100");
    assert.match(response.headers.get("cache-control"),/no-store/);
  } finally {keys.forEach((key,i)=>{if(old[i]===undefined)delete process.env[key];else process.env[key]=old[i];});}
});

test("recording deletion checks ownership and refuses an active recording", async () => {
  let removed=0;
  for (const [record,status] of [[null,404],[{status:"in-progress"},409],[{status:"completed"},200]]) {
    const route=loadModule("../src/app/api/voice/recordings/[recordingSid]/route.ts",{
      "@/lib/review-auth":{reviewOperator:async()=>({userId:"user_test"})},
      "@/lib/review-store":{getOwnedRecording:async()=>record},"@/lib/review-validation":validation,
      "@/lib/review-service":{deleteProviderRecording:async()=>{removed+=1;}},"@/lib/voice-responses":{voiceJson:json},
    });
    assert.equal((await route.DELETE(new Request("https://app.test/delete",{method:"DELETE"}),{params:Promise.resolve({recordingSid})})).status,status);
  }
  assert.equal(removed,1);
});
test("review updates cannot attach another call's recording or alter a foreign call", async () => {
  let saved=0;
  const input={notes:"Review",rating:3,bookmarks:[{id:"a",recordingSid:otherSid,seconds:2,note:"moment"}]};
  for(const [record,status] of [[null,404],[{recordings:[{sid:recordingSid,duration:10}]},400],[{recordings:[{sid:otherSid,duration:10}]},200]]) {
    const route=loadModule("../src/app/api/voice/reviews/[callSid]/route.ts",{
      "@/lib/review-auth":{reviewOperator:async()=>({userId:"user_test"}),reviewBody:async()=>input},
      "@/lib/review-store":{getReview:async()=>record,saveReview:async()=>{saved+=1;}},
      "@/lib/review-service":{},"@/lib/review-validation":validation,"@/lib/voice-responses":{voiceJson:json},
    });
    assert.equal((await route.PUT(new Request("https://app.test/review",{method:"PUT"}),{params:Promise.resolve({callSid})})).status,status);
  }
  assert.equal(saved,1);
});
test("recording callbacks verify the exact URL, account and signature and reject duplicate fields", async () => {
  const previous=[process.env.TWILIO_ACCOUNT_SID,process.env.TWILIO_AUTH_TOKEN];
  process.env.TWILIO_ACCOUNT_SID=accountSid;process.env.TWILIO_AUTH_TOKEN="test-auth";
  const url="https://app.test/api/voice/recordings/callback";
  const webhook=loadModule("../src/lib/voice-webhook.ts",{"server-only":{},"@/lib/voice-service":{voiceWebhookUrl:()=>url}});
  const params={AccountSid:accountSid,CallSid:callSid,RecordingSid:recordingSid};
  const signature=require("twilio").getExpectedTwilioSignature("test-auth",url,params);
  const request=(sig,body)=>new Request(url,{method:"POST",headers:{"X-Twilio-Signature":sig},body:new URLSearchParams(body)});
  try {
    assert.equal((await webhook.verifiedVoiceWebhook(request(signature,params),"/api/voice/recordings/callback")).RecordingSid,recordingSid);
    assert.equal(await webhook.verifiedVoiceWebhook(request("bad",params),"/api/voice/recordings/callback"),null);
    assert.equal(await webhook.verifiedVoiceWebhook(request(signature,{...params,AccountSid:"wrong"}),"/api/voice/recordings/callback"),null);
    assert.equal(await webhook.verifiedVoiceWebhook(request(signature,[...Object.entries(params),["CallSid",callSid]]),"/api/voice/recordings/callback"),null);
  } finally {for(const [i,key]of["TWILIO_ACCOUNT_SID","TWILIO_AUTH_TOKEN"].entries()){if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];}}
});
test("retention endpoint does not enumerate or delete audio without its secret", async () => {
  const old=process.env.CRON_SECRET;process.env.CRON_SECRET="test-retention-secret";
  let scanned=0;
  const route=loadModule("../src/app/api/voice/retention/route.ts",{
    "@/lib/review-store":{expiredRecordings:async()=>{scanned+=1;return[];}},"@/lib/review-service":{},"@/lib/voice-responses":{voiceJson:json},
  });
  try {assert.equal((await route.GET(new Request("https://app.test/retention"))).status,401);assert.equal(scanned,0);}
  finally {if(old===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=old;}
});
