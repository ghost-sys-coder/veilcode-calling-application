import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadModule} from './support/load-typescript.mjs';
const config=loadModule('../src/lib/billing-config.ts',{'server-only':{},'@/lib/stripe-config':{getStripeMode:()=>'test'}});
const review=loadModule('../src/lib/settlement-review-store.ts',{'server-only':{},'@/lib/review-db':{},'@/lib/customer-access':{},'@/lib/billing-config':config,'@/lib/twilio-settlement-store':{}});
const id='11111111-1111-4111-8111-111111111111',parent='CA'+'a'.repeat(32);
const input={action:'recheck',id,revision:3,note:'Provider issue investigated.'};
test('owner rechecks require a bounded note, a current revision and no financial overrides',()=>{
  assert.deepEqual(review.settlementRecheckInput({...input,note:'  Verified provider account.  '}),{id,revision:3,note:'Verified provider account.'});
  for(const value of [null,[],{}, {...input,action:'release'},{...input,seconds:0},{...input,amount:0},{...input,callSid:parent},
    {...input,id:'bad'},{...input,revision:0},{...input,revision:1.2},{...input,note:'short'},{...input,note:' '.repeat(30)},{...input,note:'x'.repeat(501)}])
    assert.throws(()=>review.settlementRecheckInput(value),error=>error.status===400);
});
test('scheduled recovery pins its own workflow/audience and refuses email scheduler identities',async()=>{
  const repository='ghost-sys-coder/veilcode-calling-application',audience='https://call.veilcode.studio/call-settlement-recovery';
  const valid={repository_id:'1414889716',repository_owner_id:'84653892',repository,ref:'refs/heads/master',sub:'signed-subject',
    workflow_ref:`${repository}/.github/workflows/call-settlement-recovery.yml@refs/heads/master`,event_name:'schedule'};
  let payload=valid,fail=false,verified=0;
  const auth=loadModule('../src/lib/github-scheduler-auth.ts',{'server-only':{},jose:{createRemoteJWKSet:()=>({}),jwtVerify:async(_token,_keys,options)=>{
    verified++;assert.equal(options.audience,audience);assert.equal(options.issuer,'https://token.actions.githubusercontent.com');assert.equal(options.maxTokenAge,'10m');
    assert.ok(options.requiredClaims.includes('iat'));assert.ok(options.requiredClaims.includes('exp'));if(fail)throw new Error('expired');return {payload};
  }}});
  const request=value=>new Request('https://app.test',{headers:{'x-veilcall-scheduler-token':value}});
  for(const token of ['','not-a-jwt','a'.repeat(20001)])assert.equal(await auth.githubSchedulerAuthorized(request(token),audience,'call-settlement-recovery.yml'),false);
  assert.equal(verified,0);assert.equal(await auth.githubSchedulerAuthorized(request('a.b.c'),audience,'call-settlement-recovery.yml'),true);
  for(const key of Object.keys(valid)){payload={...valid,[key]:'wrong'};if(key==='sub')payload.sub='';assert.equal(await auth.githubSchedulerAuthorized(request('a.b.c'),audience,'call-settlement-recovery.yml'),false);}
  payload={...valid,workflow_ref:`${repository}/.github/workflows/callback-email-reminders.yml@refs/heads/master`};assert.equal(await auth.githubSchedulerAuthorized(request('a.b.c'),audience,'call-settlement-recovery.yml'),false);
  payload=valid;fail=true;assert.equal(await auth.githubSchedulerAuthorized(request('a.b.c'),audience,'call-settlement-recovery.yml'),false);
});
test('the worker route authenticates before storage and exposes safe failure responses',async()=>{
  let authorized=false,fail=false,runs=0;
  const route=loadModule('../src/app/api/internal/call-settlements/route.ts',{
    '@/lib/github-scheduler-auth':{githubSchedulerAuthorized:async(_request,audience,workflow)=>{assert.equal(audience,'https://call.veilcode.studio/call-settlement-recovery');assert.equal(workflow,'call-settlement-recovery.yml');return authorized;}},
    '@/lib/settlement-worker':{runSettlementWorker:async()=>{runs++;if(fail)throw new Error('private');return {processed:0};}},'@/lib/voice-responses':{voiceJson:(data,status=200)=>Response.json(data,{status})},
  });
  const request=new Request('https://app.test');assert.equal((await route.GET(request)).status,401);assert.equal(runs,0);
  authorized=true;assert.equal((await route.GET(request)).status,200);fail=true;const response=await route.GET(request);assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/private/);
});
test('background recovery records a check even with no jobs and records storage failures',async()=>{
  const events=[];let fail=false;
  const worker=loadModule('../src/lib/settlement-worker.ts',{'server-only':{},'@/lib/twilio-settlement-service':{reconcileTwilioSettlements:async()=>{if(fail)throw new Error('storage');return {processed:0,settled:0,pending:0};}},
    '@/lib/settlement-review-store':{recordSettlementWorker:async success=>events.push(success)},'@/lib/twilio-settlement-store':{twilioSettlementStatus:async()=>({pending:0,due:0,review:0,done:0})}});
  assert.equal((await worker.runSettlementWorker()).processed,0);assert.deepEqual(events,[true]);fail=true;await assert.rejects(worker.runSettlementWorker());assert.deepEqual(events,[true,false]);
});
test('the owner endpoint authenticates before parsing and scopes rechecks to the persisted parent',async()=>{
  let denied=401,body=input;const events=[];
  const route=loadModule('../src/app/api/admin/call-settlements/route.ts',{'@/lib/number-access':{numberOperator:async()=>denied?Response.json({}, {status:denied}):{userId:'owner'},numberBody:async()=>body,numberApiError:()=>Response.json({}, {status:503})},
    '@/lib/settlement-review-store':{settlementRecheckInput:review.settlementRecheckInput,settlementReport:async()=>({review:0}),recheckSettlement:async(actor,parsed)=>{events.push([actor,parsed]);return parent;}},
    '@/lib/billing-config':config,'@/lib/twilio-settlement-service':{reconcileTwilioSettlements:async sid=>{events.push(sid);return {processed:1,settled:1,pending:0};}},'@/lib/voice-responses':{voiceJson:(data,status=200)=>Response.json(data,{status})}});
  const request=()=>new Request('https://app.test',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  for(const status of [401,403]){denied=status;assert.equal((await route.POST(request())).status,status);assert.equal(events.length,0);}
  denied=0;body={...input,seconds:0};assert.equal((await route.POST(request())).status,400);assert.equal(events.length,0);
  body=input;assert.equal((await route.POST(request())).status,200);assert.deepEqual(events,[['owner',{id,revision:3,note:input.note}],parent]);
});
test('the scheduled workflow never checks out code, dispatches email or logs provider identities',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/call-settlement-recovery.yml',import.meta.url),'utf8');
  assert.match(workflow,/id-token: write/);assert.match(workflow,/cancel-in-progress: false/);assert.match(workflow,/X-VeilCall-Scheduler-Token/);assert.match(workflow,/::add-mask::/);
  assert.doesNotMatch(workflow,/uses:|api\/voice\/reminders|TWILIO_AUTH_TOKEN|RESEND_API_KEY/);
});
