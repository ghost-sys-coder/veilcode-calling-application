import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { loadModule } from "./support/load-typescript.mjs";
const require=createRequire(import.meta.url);
const validation=loadModule("../src/lib/number-validation.ts");
const errors=loadModule("../src/lib/number-errors.ts");
const json=(value,status=200)=>Response.json(value,{status});
const profile={businessName:"Example business",contactName:"Alex Example",businessCountry:"UG",website:"https://example.com",purpose:"Follow up with customers who requested quotes."};
const id="11111111-1111-4111-8111-111111111111",attemptId="22222222-2222-4222-8222-222222222222";
const phone="+256772123456",accountSid=`AC${"a".repeat(32)}`,callSid=`CA${"b".repeat(32)}`,providerSid=`PN${"c".repeat(32)}`;
const requestInput={kind:"existing",label:"Business mobile",phone,details:"",ownershipConfirmed:true};
const savedRequest={...requestInput,id,operatorId:"user_customer",status:"approved",revision:2,numberCountry:"UG",business:profile};
const attempt={id:attemptId,requestId:id,operatorId:"user_customer",phone,accountSid,callSid,status:"calling",expiresAt:"2099-01-01T10:00:00Z"};

async function environment(values,run){
  const previous=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));
  try{for(const [key,value] of Object.entries(values)){if(value===undefined)delete process.env[key];else process.env[key]=value;}return await run();}
  finally{for(const [key,value]of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
}
function access({userId="user_customer",approved=true}={}){
  return loadModule("../src/lib/number-access.ts",{"server-only":{},"@clerk/nextjs/server":{auth:async()=>({userId})},
    "@/lib/access":{isApprovedOperator:()=>approved},"@/lib/voice-responses":{voiceJson:json,isSameOrigin:request=>request.headers.get("origin")==="https://app.test"},"@/lib/number-errors":errors});
}
function request(path="/api/onboarding",body,origin="https://app.test"){
  return new Request("https://app.test"+path,{method:body===undefined?"GET":"POST",headers:{origin,"content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
test("business profiles validate countries, HTTPS URLs and bounded calling purposes",()=>{
  assert.deepEqual(validation.validateBusinessProfile({...profile,businessName:"  Example business  "}),{...profile,website:"https://example.com/"});
  for(const value of [null,{}, {...profile,businessCountry:"XX"},{...profile,website:"javascript:alert(1)"},{...profile,website:"https://user:password@example.com"},
    {...profile,website:"http://example.com"},{...profile,purpose:"too short"},{...profile,purpose:"x".repeat(1201)},{...profile,businessName:"a\u0000b"}])assert.equal(validation.validateBusinessProfile(value),null);
});
test("existing numbers require explicit ownership and normalize international numbers including Uganda",()=>{
  assert.equal(validation.validateNumberRequest({...requestInput,phone:"+256 772 123456"}).phone,phone);
  assert.equal(validation.validateNumberRequest(requestInput).numberCountry,"UG");
  for(const value of [{...requestInput,ownershipConfirmed:false},{...requestInput,ownershipConfirmed:"true"},{...requestInput,phone:"0772123456"},
    {...requestInput,phone:"+44 20 7946 0123 ext 10"},{...requestInput,kind:["new"]},{...requestInput,label:""}])assert.equal(validation.validateNumberRequest(value),null);
  assert.equal(validation.validateNumberRequest({kind:"new",label:"UK sales",numberCountry:"GB",details:"London preferred"}).phone,null);
  assert.equal(validation.validateNumberRequest({kind:"new",label:"Sales",numberCountry:"UG",details:""}),null);
});
test("reviews need revisions, reasons and an explicit compliance confirmation for assignment",()=>{
  const base={action:"approve",expectedRevision:1,note:""};assert.ok(validation.validateNumberReview(base));
  for(const value of [{...base,expectedRevision:0},{...base,expectedRevision:"1"},{...base,action:"reject"},{...base,action:"revoke"},
    {...base,action:"fulfill",phone:"+442079460123"},{...base,action:["approve"]}])assert.equal(validation.validateNumberReview(value),null);
  assert.ok(validation.validateNumberReview({...base,action:"fulfill",phone:"+442079460123",complianceConfirmed:true}));
});
test("number setup requires a session and same-origin mutations; admin requires explicit role and operator approval",async()=>{
  assert.equal((await access({userId:null}).numberOperator()).status,401);
  assert.deepEqual(await access({approved:false}).numberOperator(),{userId:"user_customer"});
  assert.equal((await access().numberOperator(request(undefined,{},"https://foreign.test"))).status,403);
  await environment({VEILCALL_ADMIN_USER_IDS:"user_owner",CLERK_ALLOWED_USER_IDS:"user_owner"},async()=>{
    assert.equal((await access().numberOperator(undefined,true)).status,403);
    assert.deepEqual(await access({userId:"user_owner"}).numberOperator(undefined,true),{userId:"user_owner"});
    assert.equal((await access({userId:"user_owner",approved:false}).numberOperator(undefined,true)).status,403);
  });
});
test("legacy caller ownership never expands when another operator is allowlisted",async()=>{
  await environment({TWILIO_CALLER_ID_OWNER_USER_ID:undefined,CLERK_ALLOWED_USER_IDS:"user_owner"},()=>assert.equal(access().legacyCallerOwner(),"user_owner"));
  await environment({TWILIO_CALLER_ID_OWNER_USER_ID:undefined,CLERK_ALLOWED_USER_IDS:"user_owner,user_customer"},()=>assert.equal(access().legacyCallerOwner(),null));
  await environment({TWILIO_CALLER_ID_OWNER_USER_ID:"user_owner",CLERK_ALLOWED_USER_IDS:"user_owner,user_customer"},()=>assert.equal(access().legacyCallerOwner(),"user_owner"));
});
test("onboarding JSON enforces content type and byte limits even without Content-Length",async()=>{
  const helper=access();assert.deepEqual(await helper.numberBody(request(undefined,{name:"Alex"})),{name:"Alex"});
  await assert.rejects(helper.numberBody(new Request("https://app.test",{method:"POST",body:"{}"})),error=>error.status===415);
  await assert.rejects(helper.numberBody(request(undefined,{data:"x".repeat(9000)})),error=>error.status===413);
  await assert.rejects(helper.numberBody(new Request("https://app.test",{method:"POST",headers:{"content-type":"application/json"},body:"{"})),error=>error.status===400);
  assert.equal(helper.numberApiError(new Error("private provider secret")).status,503);
  assert.doesNotMatch(await helper.numberApiError(new Error("private provider secret")).text(),/private provider/);
});
test("each operator sees only assigned active caller IDs and only the legacy owner has outage fallback",async()=>{
  function callers({owner="user_owner",configured=true,fail=false}={}){
    return loadModule("../src/lib/operator-caller-ids.ts",{"server-only":{},"@/lib/caller-ids":{getApprovedCallerIds:()=>[{number:"+442079460123",label:"Legacy"}]},
      "@/lib/number-access":{legacyCallerOwner:()=>owner},"@/lib/review-db":{reviewStorageConfigured:()=>configured},
      "@/lib/number-store":{listCallerIdentities:async(user)=>{if(fail)throw new Error("database");return [{number:phone,label:user,source:"verified",status:"active"},{number:"+61412345678",label:"Revoked",status:"revoked"}];}}});
  }
  assert.deepEqual(await callers().operatorCallerIds("user_customer"),[{number:phone,label:"user_customer"}]);
  assert.equal((await callers().operatorCallerIds("user_owner")).length,2);
  assert.deepEqual(await callers({configured:false}).operatorCallerIds("user_customer"),[]);
  assert.equal((await callers({fail:true}).operatorCallerIds("user_owner")).length,1);
  await assert.rejects(callers({fail:true}).operatorCallerIds("user_customer"));
});

test("Voice tokens are denied before JWT creation when an approved operator has no assigned number",async()=>{
  let created=false;
  class AccessToken {constructor(){created=true;}}
  const handlers=loadModule("../src/app/api/voice/token/route.ts",{
    "@clerk/nextjs/server":{auth:async()=>({userId:"user_customer"})},twilio:{jwt:{AccessToken}},
    "@/lib/access":{isApprovedOperator:()=>true},"@/lib/operator-caller-ids":{operatorCallerIds:async()=>[]},
    "@/lib/voice-config":{getVoiceConfig:()=>({})},"@/lib/voice-responses":{voiceJson:json},
  });
  assert.equal((await handlers.GET()).status,403);assert.equal(created,false);
});

test("setup and admin reads reject absent or insufficient sessions before touching storage",async()=>{
  for(const [path,status] of [["../src/app/api/onboarding/route.ts",401],["../src/app/api/onboarding/admin/route.ts",403]]){
    const handlers=loadModule(path,{"@/lib/number-access":{numberOperator:async()=>json({error:"Denied"},status)},
      "@/lib/number-store":{},"@/lib/caller-ids":{},"@/lib/access":{},"@/lib/number-service":{},"@/lib/voice-responses":{voiceJson:json}});
    assert.equal((await handlers.GET(request())).status,status);
  }
});

function route(path,{operator={userId:"user_customer"},body=profile,store={},service={}}={}){
  const events=[];const base=access();
  const handlers=loadModule(path,{"@/lib/number-access":{...base,numberOperator:async(req,admin)=>{events.push(["auth",!!req,!!admin]);return operator;},
    numberBody:async()=>{events.push("body");return body;}},"@/lib/number-validation":validation,"@/lib/number-store":store,
    "@/lib/number-service":service,"@/lib/voice-responses":{voiceJson:json}});
  return {module:handlers,events};
}
test("profile, request, verification and admin mutations reject unauthorized callers before parsing",async()=>{
  for(const path of ["../src/app/api/onboarding/profile/route.ts","../src/app/api/onboarding/numbers/route.ts","../src/app/api/onboarding/numbers/[requestId]/verify/route.ts","../src/app/api/onboarding/admin/[requestId]/route.ts"]){
    const {module,events}=route(path,{operator:json({error:"Denied"},403)});
    const handler=module.POST??module.PUT;assert.equal((await handler(request(undefined,{}),{params:Promise.resolve({requestId:id})})).status,403);
    assert.equal(events.length,1);
  }
});
test("customer profile and request routes ignore browser-supplied operator IDs",async()=>{
  const writes=[];
  const profileRoute=route("../src/app/api/onboarding/profile/route.ts",{body:{...profile,operatorId:"user_other"},store:{saveBusinessProfile:async(...args)=>writes.push(args)}});
  assert.equal((await profileRoute.module.PUT(request(undefined,{}))).status,200);assert.equal(writes[0][0],"user_customer");
  const numberRoute=route("../src/app/api/onboarding/numbers/route.ts",{body:{...requestInput,operatorId:"user_other"},store:{createNumberRequest:async(...args)=>{writes.push(args);return id;}},service:{assertNotConfiguredNumber:()=>{}}});
  assert.equal((await numberRoute.module.POST(request(undefined,{}))).status,201);assert.equal(writes[1][0],"user_customer");
});
test("verification endpoint requires explicit consent before initiating a call",async()=>{
  let calls=0;
  for(const consent of [false,"true",undefined]){
    const {module}=route("../src/app/api/onboarding/numbers/[requestId]/verify/route.ts",{body:{consent},service:{startNumberVerification:async()=>calls++}});
    assert.equal((await module.POST(request(undefined,{}),{params:Promise.resolve({requestId:id})})).status,400);
  }
  assert.equal(calls,0);
});
test("administration authenticates as admin, validates revision and passes only server actor",async()=>{
  let received;
  const fixture=route("../src/app/api/onboarding/admin/[requestId]/route.ts",{body:{action:"approve",expectedRevision:2,note:"",actor:"other"},service:{administerNumberRequest:async(...args)=>{received=args;}}});
  assert.equal((await fixture.module.POST(request(undefined,{}),{params:Promise.resolve({requestId:id})})).status,200);
  assert.deepEqual(fixture.events[0],["auth",true,true]);assert.equal(received[1],"user_customer");assert.equal(received[2].expectedRevision,2);
});

function service({failure,beginFailure,record=savedRequest,numbers=[],validationOverride={}}={}){
  const events=[];
  const provider={validationRequests:{create:async(input)=>{events.push(["provider",input]);if(failure)throw failure;return {phoneNumber:phone,accountSid,callSid,validationCode:"123456",...validationOverride};}},
    incomingPhoneNumbers:{list:async(input)=>{events.push(["lookup",input]);return numbers;}}};
  const handlers=loadModule("../src/lib/number-service.ts",{"server-only":{},"@/lib/caller-ids":{getApprovedCallerIds:()=>[{number:"+442079460123",label:"Legacy"}]},
    "@/lib/voice-service":{voiceService:()=>provider,voiceWebhookUrl:path=>new URL(path,"https://app.test").href},"@/lib/number-errors":errors,
    "@/lib/number-store":{getNumberRequest:async(id,user)=>{events.push(["request",id,user]);return record;},beginNumberVerification:async()=>{events.push("admission");if(beginFailure)throw beginFailure;return attempt;},
      attachNumberVerification:async(...args)=>events.push(["attached",...args]),failNumberVerification:async(...args)=>events.push(["failed",...args]),reviewNumberRequest:async(...args)=>events.push(["review",...args])}});
  return {module:handlers,events};
}
const verificationEnv={TWILIO_CALLING_ENABLED:"true",TWILIO_ACCOUNT_SID:accountSid,TWILIO_AUTH_TOKEN:"fixture-token"};
test("verification checks ownership and durable admission before provider calls, and sends the attempt-bound callback",async()=>{
  await environment(verificationEnv,async()=>{
    const foreign=service({record:null});await assert.rejects(foreign.module.startNumberVerification(id,"user_other"),error=>error.status===404);assert.equal(foreign.events.length,1);
    const capped=service({beginFailure:new errors.NumberSetupError("Limit",429)});await assert.rejects(capped.module.startNumberVerification(id,"user_customer"),error=>error.status===429);assert.equal(capped.events.some(event=>Array.isArray(event)&&event[0]==="provider"),false);
    const fixture=service();const result=await fixture.module.startNumberVerification(id,"user_customer");assert.equal(result.code,"123456");
    assert.equal(fixture.events[1],"admission");const call=fixture.events[2][1];assert.equal(call.phoneNumber,phone);assert.equal(call.callDelay,10);assert.equal(call.statusCallback,`https://app.test/api/onboarding/numbers/verification/callback?attempt=${attemptId}`);
  });
});
test("verification timeouts retain their reservation while confirmed rejections can be retried",async()=>{
  await environment(verificationEnv,async()=>{
    for(const [failure,failed] of [[new Error("private timeout"),false],[{status:400,message:"private provider error"},true]]){
      const fixture=service({failure});await assert.rejects(fixture.module.startNumberVerification(id,"user_customer"),error=>error.status===503&&!error.message.includes("private"));
      assert.equal(fixture.events.some(event=>Array.isArray(event)&&event[0]==="failed"),failed);
    }
    const disabled=service();await environment({TWILIO_CALLING_ENABLED:"false"},()=>assert.rejects(disabled.module.startNumberVerification(id,"user_customer"),error=>error.status===503));assert.equal(disabled.events.length,0);
  });
});
test("new-number assignment only reads already-owned voice numbers in the requested country",async()=>{
  await environment(verificationEnv,async()=>{
    const input={action:"fulfill",expectedRevision:2,note:"Confirmed",phone:"+61412345678",complianceConfirmed:true};
    const record={...savedRequest,kind:"new",phone:null,numberCountry:"AU"};
    const valid=service({record,numbers:[{phoneNumber:input.phone,accountSid,sid:providerSid,capabilities:{voice:true}}]});
    await valid.module.administerNumberRequest(id,"user_owner",input);assert.ok(valid.events.some(event=>Array.isArray(event)&&event[0]==="review"));
    for(const numbers of [[],[{phoneNumber:input.phone,accountSid,sid:providerSid,capabilities:{voice:false}}],[{phoneNumber:input.phone,accountSid:"other",sid:providerSid,capabilities:{voice:true}}]]){
      const fixture=service({record,numbers});await assert.rejects(fixture.module.administerNumberRequest(id,"user_owner",input),error=>error.status===409);assert.equal(fixture.events.some(event=>Array.isArray(event)&&event[0]==="review"),false);
    }
    await assert.rejects(valid.module.administerNumberRequest(id,"user_owner",{...input,phone:"+14165550123"}),error=>error.status===400);
  });
});

const callbackPath=`/api/onboarding/numbers/verification/callback?attempt=${attemptId}`;
const actualWebhook=loadModule("../src/lib/voice-webhook.ts",{"server-only":{},"@/lib/voice-service":{voiceWebhookUrl:path=>new URL(path,"https://app.test").href}});
function callback({stored=attempt,caller={phoneNumber:phone,accountSid,sid:providerSid}}={}){
  const completed=[];let reads=0;
  const handlers=loadModule("../src/app/api/onboarding/numbers/verification/callback/route.ts",{"@/lib/voice-webhook":actualWebhook,"@/lib/number-validation":validation,
    "@/lib/number-store":{getVerificationAttempt:async()=>stored,completeNumberVerification:async(...args)=>completed.push(args)},
    "@/lib/voice-service":{voiceService:()=>({outgoingCallerIds:()=>({fetch:async()=>{reads++;return caller;}})})}});
  async function send(overrides={},signed=true,path=callbackPath,duplicate=false){
    const params={AccountSid:accountSid,CallSid:callSid,To:phone,VerificationStatus:"success",OutgoingCallerIdSid:providerSid,...overrides};
    const signature=require("twilio").getExpectedTwilioSignature("fixture-token","https://app.test"+path,params);
    const body=new URLSearchParams(params);if(duplicate)body.append("To",phone);
    return handlers.POST(new Request("https://app.test"+path,{method:"POST",headers:{"X-Twilio-Signature":signed?signature:"invalid"},body}));
  }
  return {send,completed,reads:()=>reads};
}
test("verification callbacks validate signature, account, attempt, recipient and provider call ID",async()=>{
  await environment(verificationEnv,async()=>{
    const fixture=callback();
    for(const [overrides,signed,path,duplicate] of [[{},false],[{AccountSid:"other"},true],[{To:"+442079460123"},true],[{CallSid:`CA${"d".repeat(32)}`},true],[{},true,callbackPath,true],[{},true,callbackPath+"&unexpected=1"]])assert.equal((await fixture.send(overrides,signed,path,duplicate)).status,403);
    assert.equal(fixture.completed.length,0);assert.equal(fixture.reads(),0);
    assert.equal((await fixture.send()).status,204);assert.equal(fixture.completed[0][2],providerSid);
  });
});
test("only a verified provider resource for the same phone grants identity; failed, expired and replayed callbacks do not",async()=>{
  await environment(verificationEnv,async()=>{
    const mismatched=callback({caller:{phoneNumber:"+442079460123",accountSid,sid:providerSid}});assert.equal((await mismatched.send()).status,403);assert.equal(mismatched.completed.length,0);
    for(const stored of [{...attempt,status:"success"},{...attempt,expiresAt:"2000-01-01T00:00:00Z"}]){const fixture=callback({stored});assert.equal((await fixture.send()).status,204);assert.equal(fixture.completed.length,0);assert.equal(fixture.reads(),0);}
    const failed=callback();assert.equal((await failed.send({VerificationStatus:"failed",OutgoingCallerIdSid:""})).status,204);assert.equal(failed.completed[0][2],null);assert.equal(failed.reads(),0);
    const race=callback({stored:{...attempt,callSid:null,status:"preparing"}});assert.equal((await race.send()).status,204);assert.equal(race.completed[0][1],callSid);
  });
});
