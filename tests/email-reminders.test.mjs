import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./support/load-typescript.mjs";
const json=(body,status=200)=>Response.json(body,{status});
const callSid=`CA${"a".repeat(32)}`;
const job={callSid,scheduleVersion:1,operatorId:"owner",callbackAt:"2026-10-24T12:00:00Z",phone:"+442079460123",name:"<script>& Contact",timezone:"Africa/Kampala",leaseToken:"lease",payload:null};
const message=loadModule("../src/lib/email-reminder-message.ts");

test("email content escapes contact data and uses private authenticated links without call notes",()=>{
  const payload=message.reminderEmail(job,"owner@example.com","VeilCall <reminders@mail.veilcode.studio>","https://call.veilcode.studio");
  assert.deepEqual(payload.to,["owner@example.com"]);assert.equal(payload.subject,"Your VeilCall callback is due");
  assert.doesNotMatch(payload.html,/<script>/);assert.match(payload.html,/&lt;script&gt;&amp; Contact/);
  assert.match(payload.text,/Africa\/Kampala/);assert.match(payload.text,/https:\/\/call.veilcode.studio\/console\?callback=CA/);assert.doesNotMatch(payload.subject,/Contact|4420/);
});
test("email delivery fails closed when disabled, incomplete, on preview or with an unsafe sender/origin",()=>{
  const old={...process.env};
  const config=loadModule("../src/lib/email-reminder-config.ts",{"server-only":{}});
  try {
    process.env.RESEND_API_KEY="test";process.env.RESEND_FROM_EMAIL="VeilCall <reminders@mail.veilcode.studio>";process.env.CALLBACK_EMAIL_ENABLED="true";process.env.CRON_SECRET="secret";process.env.NEXT_PUBLIC_SITE_URL="https://call.veilcode.studio";delete process.env.VERCEL_ENV;
    assert.ok(config.emailReminderConfig());
    for(const [key,value] of [["CALLBACK_EMAIL_ENABLED","false"],["RESEND_API_KEY",""],["CRON_SECRET",""],["RESEND_FROM_EMAIL","a@example.com\nBcc: other@example.com"],["NEXT_PUBLIC_SITE_URL","http://localhost:3000"],["VERCEL_ENV","preview"]]){
      const previous=process.env[key];process.env[key]=value;assert.equal(config.emailReminderConfig(),null);if(previous===undefined)delete process.env[key];else process.env[key]=previous;
    }
  } finally{process.env=old;}
});
test("only a current verified primary email can receive an operator's reminders",async()=>{
  let user={primaryEmailAddressId:"primary",emailAddresses:[{id:"primary",emailAddress:"owner@example.com",verification:{status:"verified"}},{id:"other",emailAddress:"other@example.com",verification:{status:"verified"}}],banned:false,locked:false};
  const recipient=loadModule("../src/lib/email-recipient.ts",{"server-only":{},"@clerk/nextjs/server":{clerkClient:async()=>({users:{getUser:async(id)=>{assert.equal(id,"owner");return user;}}})}});
  assert.equal(await recipient.verifiedOperatorEmail("owner"),"owner@example.com");
  for(const patch of [{banned:true},{locked:true},{primaryEmailAddressId:"missing"},{emailAddresses:[{id:"primary",emailAddress:"owner@example.com",verification:{status:"unverified"}}]}]){
    const old=user;user={...user,...patch};assert.equal(await recipient.verifiedOperatorEmail("owner"),null);user=old;
  }
});
test("scheduler identity is bound to this repository, workflow, branch, event and audience",async()=>{
  const previous=process.env.CRON_SECRET;process.env.CRON_SECRET="cron_secret";
  const repo="ghost-sys-coder/veilcode-calling-application";
  const valid={repository_id:"1414889716",repository_owner_id:"84653892",repository:repo,ref:"refs/heads/master",sub:`repo:${repo}:ref:refs/heads/master`,workflow_ref:`${repo}/.github/workflows/callback-email-reminders.yml@refs/heads/master`,event_name:"schedule"};
  let payload=valid,throws=false,verifications=0;
  const scheduler=loadModule("../src/lib/github-scheduler-auth.ts",{"server-only":{},jose:{createRemoteJWKSet:()=>({}),jwtVerify:async(token,keys,options)=>{verifications++;assert.equal(options.issuer,"https://token.actions.githubusercontent.com");assert.equal(options.audience,"https://call.veilcode.studio/callback-email-dispatch");assert.deepEqual(options.algorithms,["RS256"]);assert.equal(options.maxTokenAge,"10m");assert.ok(options.requiredClaims.includes("exp"));if(throws)throw new Error("bad signature");return {payload};}}});
  const auth=loadModule("../src/lib/email-dispatch-auth.ts",{"server-only":{},"@/lib/github-scheduler-auth":scheduler});
  const req=(value)=>new Request("https://app.test/dispatch",{headers:{Authorization:value}});
  try {
    for(const value of ["","Bearer undefined","Bearer malformed","Bearer "+"a".repeat(20001)])assert.equal(await auth.emailDispatchAuthorized(req(value)),false);
    assert.equal(verifications,0);assert.equal(await auth.emailDispatchAuthorized(req("Bearer cron_secret")),true);assert.equal(verifications,0);
    assert.equal(await auth.emailDispatchAuthorized(req("Bearer a.b.c")),true);
    assert.equal(await auth.emailDispatchAuthorized(new Request("https://app.test/dispatch",{headers:{"X-VeilCall-Scheduler-Token":"a.b.c"}})),true);
    for(const key of Object.keys(valid).filter(key=>key!=="sub")){payload={...valid,[key]:"wrong"};assert.equal(await auth.emailDispatchAuthorized(req("Bearer a.b.c")),false,key);}
    payload={...valid,sub:"repository_id:1414889716:ref:refs/heads/master"};assert.equal(await auth.emailDispatchAuthorized(req("Bearer a.b.c")),true);
    payload={...valid,sub:""};assert.equal(await auth.emailDispatchAuthorized(req("Bearer a.b.c")),false);
    payload={...valid,event_name:"workflow_dispatch"};assert.equal(await auth.emailDispatchAuthorized(req("Bearer a.b.c")),true);
    payload={...valid,event_name:"push"};assert.equal(await auth.emailDispatchAuthorized(req("Bearer a.b.c")),true);
    throws=true;assert.equal(await auth.emailDispatchAuthorized(req("Bearer a.b.c")),false);
  } finally{if(previous===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=previous;}
});
test("Resend sends use an idempotency key and safely distinguish retryable failures",async()=>{
  const original=globalThis.fetch;
  const mail=loadModule("../src/lib/resend-mail.ts",{"server-only":{}});
  const payload=message.reminderEmail(job,"owner@example.com","sender@example.com","https://call.veilcode.studio");
  try {
    globalThis.fetch=async(url,options)=>{assert.equal(url,"https://api.resend.com/emails");assert.equal(options.headers["Idempotency-Key"],"stable-key");assert.deepEqual(JSON.parse(options.body),payload);return json({id:"11111111-1111-1111-1111-111111111111"});};
    assert.equal(await mail.sendReminderEmail("test",payload,"stable-key"),"11111111-1111-1111-1111-111111111111");
    for(const [status,name,retryable] of [[429,"rate_limit_exceeded",true],[503,"internal_error",true],[422,"validation_error",false],[403,"restricted_api_key",false],[409,"concurrent_idempotent_requests",true],[409,"invalid_idempotent_request",false]]){
      globalThis.fetch=async()=>json({name,message:"private email address"},status);await assert.rejects(mail.sendReminderEmail("test",payload,"stable-key"),error=>error instanceof mail.MailError && error.retryable===retryable && !error.message.includes("private"));
    }
    globalThis.fetch=async()=>{throw new Error("secret details");};await assert.rejects(mail.sendReminderEmail("test",payload,"stable-key"),error=>error.retryable && error.code==="network_error");
  } finally{globalThis.fetch=original;}
});
test("dispatch retries use the frozen message and key; changed recipients and stale callbacks are not sent",async()=>{
  const previous=process.env.CLERK_ALLOWED_USER_IDS;process.env.CLERK_ALLOWED_USER_IDS="owner";
  let jobs=[],sent=0,prepared=true,recipient="owner@example.com",fail=false;const finished=[];
  const frozen={from:"sender@example.com",to:[recipient],subject:"Saved",text:"Saved",html:"<p>Saved</p>"};
  const {MailError}=loadModule("../src/lib/resend-mail.ts",{"server-only":{}});
  const service=loadModule("../src/lib/email-reminder-service.ts",{
    "server-only":{},"@/lib/access":{operatorHasAccess:id=>id==="owner",approvedOperatorIds:async()=>["owner"]},"@/lib/email-reminder-config":{emailReminderConfig:()=>({apiKey:"test",from:"sender@example.com",site:"https://call.veilcode.studio"})},
    "@/lib/email-recipient":{verifiedOperatorEmail:async()=>recipient},"@/lib/email-reminder-message":message,
    "@/lib/email-reminder-store":{claimEmailJob:async()=>jobs.shift() || null,prepareEmailJob:async()=>prepared,finishEmailJob:async(job,result)=>finished.push(result)},
    "@/lib/resend-mail":{MailError,sendReminderEmail:async(key,payload,idempotency)=>{sent++;assert.deepEqual(payload,frozen);assert.equal(idempotency,`veilcall-callback/${callSid}/1`);if(fail)throw new Error("uncertain");return "accepted";}},
  });
  try {
    jobs=[{...job,payload:frozen}];assert.equal((await service.dispatchCallbackEmails()).accepted,1);assert.equal(sent,1);
    jobs=[{...job,payload:frozen}];recipient="changed@example.com";assert.equal((await service.dispatchCallbackEmails()).failed,1);assert.equal(sent,1);
    jobs=[{...job,payload:frozen}];recipient=frozen.to[0];prepared=false;assert.equal((await service.dispatchCallbackEmails()).skipped,1);assert.equal(sent,1);
    jobs=[{...job,payload:frozen}];prepared=true;fail=true;assert.equal((await service.dispatchCallbackEmails()).retry,1);assert.equal(finished.at(-1).retryable,true);
  } finally{if(previous===undefined)delete process.env.CLERK_ALLOWED_USER_IDS;else process.env.CLERK_ALLOWED_USER_IDS=previous;}
});
test("email preference API authenticates before storage and prevents arbitrary recipients",async()=>{
  const dashboardTypes=loadModule("../src/lib/dashboard-types.ts");const validation=loadModule("../src/lib/dashboard-validation.ts",{"@/lib/dashboard-types":dashboardTypes});
  let operator={userId:"owner"},body={enabled:true,timezone:"Africa/Kampala",email:"attacker@example.com"},writes=0,configured=true,verified=true;
  const route=loadModule("../src/app/api/voice/reminders/email/preferences/route.ts",{
    "@/lib/review-auth":{reviewOperator:async(request)=>{if(request)assert.equal(request.method,"PUT");return operator;},reviewBody:async()=>body},"@/lib/dashboard-validation":validation,
    "@/lib/email-reminder-config":{emailReminderConfig:()=>configured ? {} : null},"@/lib/email-recipient":{verifiedOperatorEmail:async()=>verified ? "owner@example.com" : null},
    "@/lib/email-reminder-store":{getEmailPreferences:async()=>({enabled:false}),saveEmailPreferences:async(user,enabled,zone)=>{assert.equal(user,"owner");assert.equal(enabled,body.enabled);assert.equal(zone,body.timezone);writes++;}},"@/lib/voice-responses":{voiceJson:json},
  });const request=()=>new Request("https://app.test/preferences",{method:"PUT"});
  for(const status of [401,403]){operator=json({},status);assert.equal((await route.GET()).status,status);assert.equal((await route.PUT(request())).status,status);}assert.equal(writes,0);operator={userId:"owner"};
  assert.equal((await route.PUT(request())).status,200);assert.equal((await (await route.GET()).json()).recipient,"owner@example.com");
  configured=false;assert.equal((await route.PUT(request())).status,503);verified=false;configured=true;assert.equal((await route.PUT(request())).status,400);
  body={enabled:false,timezone:"Africa/Kampala"};assert.equal((await route.PUT(request())).status,200);
  body={enabled:true,timezone:"invalid"};assert.equal((await route.PUT(request())).status,400);assert.equal(writes,2);
});
test("email dispatcher rejects unauthorized callers before processing and hides failures",async()=>{
  let authorized=false,processed=0;
  const route=loadModule("../src/app/api/voice/reminders/email/dispatch/route.ts",{"@/lib/email-dispatch-auth":{emailDispatchAuthorized:async()=>authorized},"@/lib/email-reminder-service":{dispatchCallbackEmails:async()=>{processed++;return {accepted:0};}},"@/lib/voice-responses":{voiceJson:json}});
  const request=new Request("https://app.test/dispatch");assert.equal((await route.GET(request)).status,401);assert.equal(processed,0);authorized=true;assert.equal((await route.GET(request)).status,200);assert.equal(processed,1);
});
