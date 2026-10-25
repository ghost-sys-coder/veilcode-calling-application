import assert from 'node:assert/strict';
import test from 'node:test';
import {loadModule} from './support/load-typescript.mjs';
const config=loadModule('../src/lib/billing-config.ts',{'server-only':{},'@/lib/stripe-config':{getStripeMode:()=>'test'}});
const types=loadModule('../src/lib/prepaid-types.ts');
const rules=loadModule('../src/lib/prepaid-rules.ts',{'server-only':{},'@/lib/billing-config':config,'@/lib/prepaid-types':types});
const id='6acb842c-278f-4e63-b133-43a0b1176c94',other='9cbd43cd-ce2c-4dd1-99de-2b60bd057ee9';
const parent='CA'+'a'.repeat(32),child='CA'+'b'.repeat(32);
const reservation={id,operatorId:'user_fixture',accountId:'account',mode:'test',to:'+442079460123',from:'+256772123456',route:'UG → GB landline',rateMicro:60000,feeMicro:10000,heldMicro:310000,maxSeconds:300,status:'active',callSid:parent};
const proof=()=>({source:'prepaid-test',accountSid:rules.testProviderAccount,parent:{sid:parent,from:'client:user_fixture',status:'completed',duration:95},child:{sid:child,parentSid:parent,from:reservation.from,to:reservation.to,status:'completed',duration:60}});
async function environment(values,run){const previous=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));try{for(const [key,value]of Object.entries(values)){if(value===undefined)delete process.env[key];else process.env[key]=value;}return await run();}finally{for(const [key,value]of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}}
test('prepaid test mode requires the isolated database and disabled real calling, recording and email',async()=>{
  const current=loadModule('../src/lib/prepaid-config.ts',{'server-only':{},'@/lib/billing-config':{...config,requireTestBilling:()=>({})}});
  const safe={DATABASE_URL:'postgresql://fixture:fixture@ep-noisy-waterfall-b9lcv5rb.c-7.eu-central-1.aws.neon.tech/veilcall',VERCEL_ENV:'preview',TWILIO_CALLING_ENABLED:'false',VOICE_RECORDING_ENABLED:'false',CALLBACK_EMAIL_ENABLED:'false'};
  await environment(safe,()=>assert.doesNotThrow(()=>current.requirePrepaidTestEnvironment()));
  for(const patch of [{DATABASE_URL:'postgresql://fixture:fixture@ep-small-rice-b9lq13pd.c-7.eu-central-1.aws.neon.tech/veilcall'},{DATABASE_URL:'invalid'},{VERCEL_ENV:'production'},{TWILIO_CALLING_ENABLED:'true'},{VOICE_RECORDING_ENABLED:'true'},{CALLBACK_EMAIL_ENABLED:'true'}])
    await environment({...safe,...patch},()=>assert.throws(()=>current.requirePrepaidTestEnvironment(),error=>error.status===409));
});
test('test outcomes are bounded and unanswered calls cannot claim connected seconds',()=>{
  assert.deepEqual(rules.prepaidRunInput('completed',3600),{scenario:'completed',seconds:3600});
  for(const scenario of ['busy','failed','no-answer','canceled'])assert.deepEqual(rules.prepaidRunInput(scenario,0),{scenario,seconds:0});
  for(const [scenario,seconds] of [['unknown',60],['completed',-1],['completed',1.5],['completed','60'],['completed',3601],['busy',1]])assert.throws(()=>rules.prepaidRunInput(scenario,seconds));
});
test('prepaid TwiML fixes the caller, destination, ringing timeout and server duration limit then hangs up',()=>{
  const xml=rules.prepaidDialTwiML(reservation);
  assert.match(xml,/timeLimit="300"/);assert.match(xml,/timeout="30"/);assert.match(xml,/callerId="\+256772123456"/);assert.match(xml,/<Number>\+442079460123<\/Number>/);assert.match(xml,/record="do-not-record"/);assert.match(xml,/<\/Dial><Hangup\/>/);
  for(const patch of [{maxSeconds:0},{maxSeconds:301},{maxSeconds:1.5},{to:'<Dial>bad</Dial>'},{from:'client:foreign'}])assert.throws(()=>rules.prepaidDialTwiML({...reservation,...patch}));
});
test('settlement requires canonical terminal records for both bound legs and the test provider account',()=>{
  assert.equal(rules.prepaidProofSeconds(reservation,proof()),60);
  for(const mutate of [p=>p.source='live',p=>p.accountSid='foreign',p=>p.parent.sid=child,p=>p.parent.from='client:other',p=>p.child.parentSid=child,p=>p.child.sid=parent,p=>p.child.to='+61293744000',p=>p.child.from='+442079460124']){
    const result=proof();mutate(result);assert.throws(()=>rules.prepaidProofSeconds(reservation,result),error=>error.status===403);
  }
  assert.throws(()=>rules.prepaidProofSeconds({...reservation,mode:'live'},proof()),error=>error.status===403);
  for(const mutate of [p=>p.parent.status='in-progress',p=>p.child.status='ringing',p=>p.parent.duration=10,p=>p.child.duration=-1,p=>p.child.duration=1.5,p=>p.child.status='busy']){
    const result=proof();mutate(result);assert.throws(()=>rules.prepaidProofSeconds(reservation,result),error=>error.status===409);
  }
});
function serviceFixture({caller=reservation.from,stored=reservation,canonical=proof()}={}){
  const calls=[];
  const service=loadModule('../src/lib/prepaid-service.ts',{'server-only':{},'@/lib/billing-config':config,'@/lib/prepaid-config':{requirePrepaidTestEnvironment:()=>{}},
    '@/lib/billing-service':{requireBillingEligibility:async()=>{}},'@/lib/operator-caller-ids':{operatorCallerIds:async()=>[{number:caller}]},'@/lib/billing-rates':{},'@/lib/prepaid-rules':rules,
    '@/lib/billing-store':{settleBillingReservation:async(...args)=>calls.push({kind:'settle',args})},
    '@/lib/prepaid-store':{getPrepaidQuote:async()=>({id,from:reservation.from}),reservePrepaidQuote:async(...args)=>calls.push({kind:'reserve',args}),ownedPrepaidReservation:async()=>stored,
      activatePrepaidTest:async(...args)=>calls.push({kind:'start',args}),completeTestProviderRun:async()=>canonical,cancelPrepaidTest:async()=>{},readPrepaidState:async()=>{},subscriptionReady:()=>true,recoverablePrepaidReservation:async()=>null},
  });return {service,calls};
}
test('explicit rate acceptance and a currently owned caller are required before reserving or starting',async()=>{
  const fixture=serviceFixture();await assert.rejects(fixture.service.acceptPrepaidRate('user_fixture',id,false));assert.equal(fixture.calls.length,0);
  await fixture.service.acceptPrepaidRate('user_fixture',id,true);assert.equal(fixture.calls[0].kind,'reserve');
  const revoked=serviceFixture({caller:'+442079460124'});
  await assert.rejects(revoked.service.acceptPrepaidRate('user_fixture',id,true),error=>error.status===403);
  await assert.rejects(revoked.service.startPrepaidRun('user_fixture',id,'completed',60),error=>error.status===403);assert.equal(revoked.calls.length,0);
});
test('a browser cannot choose settlement duration, identities or amount after a run starts',async()=>{
  const fixture=serviceFixture();await fixture.service.settlePrepaidRun('user_fixture',id,true);
  const settled=fixture.calls[0];assert.equal(settled.kind,'settle');assert.equal(settled.args[0],id);assert.equal(settled.args[1],parent);assert.equal(settled.args[2],60);assert.equal(settled.args[3],child);assert.equal(settled.args[4].simulation,true);
  const waiting=serviceFixture({canonical:null});await waiting.service.settlePrepaidRun('user_fixture',id,false);assert.equal(waiting.calls.length,0);
  const foreign=serviceFixture({stored:null});await assert.rejects(foreign.service.settlePrepaidRun('user_other',id,true),error=>error.status===404);assert.equal(foreign.calls.length,0);
});
const json=(value,status=200)=>Response.json(value,{status});
function apiFixture({denied=0,disabled=false}={}){
  const calls=[];let body;
  const route=loadModule('../src/app/api/billing/prepaid/route.ts',{
    '@/lib/billing-auth':{billingOperator:async()=>denied ? json({},denied) : {userId:'user_fixture'},billingBody:async()=>body,billingApiError:error=>json({error:error instanceof config.BillingError ? error.message : 'Unavailable'},error.status??503)},
    '@/lib/billing-config':config,'@/lib/voice-responses':{voiceJson:json},
    '@/lib/prepaid-service':{requirePrepaidOperator:async()=>{if(disabled)throw new config.BillingError('Test only',409);},prepaidView:async()=>({heldMicro:0}),recoverPrepaidRun:async()=>calls.push('recover'),previewPrepaidRate:async()=>({id}),
      acceptPrepaidRate:async(...args)=>calls.push(['reserve',...args]),startPrepaidRun:async(...args)=>calls.push(['start',...args]),settlePrepaidRun:async(...args)=>calls.push(['settle',...args]),cancelPrepaidTest:async(...args)=>calls.push(['cancel',...args])},
  });return {route,calls,post:async value=>{body=value;return route.POST(new Request('https://app.test/api/billing/prepaid',{method:'POST'}));}};
}
test('the prepaid API rejects unauthenticated, non-owner and non-preview requests before storage',async()=>{
  for(const denied of [401,403]){const f=apiFixture({denied});assert.equal((await f.route.GET()).status,denied);assert.equal((await f.post({action:'recover'})).status,denied);assert.equal(f.calls.length,0);}
  const f=apiFixture({disabled:true});assert.equal((await f.route.GET()).status,409);assert.equal((await f.post({action:'recover'})).status,409);assert.equal(f.calls.length,0);
});
test('API actions reject extra settlement, quote-price or provider fields rather than trusting client amounts',async()=>{
  const f=apiFixture();
  for(const input of [{action:'complete',id,seconds:1},{action:'complete',id,callSid:parent},{action:'reserve',quoteId:id,consent:true,rateMicro:1},{action:'reserve',quoteId:'invalid',consent:true},{action:'constructor'},{action:'start',id:'bad',scenario:'completed',seconds:60},{action:'quote',to:'x'.repeat(31),from:reservation.from}])assert.equal((await f.post(input)).status,400);
  assert.equal(f.calls.length,0);
  assert.equal((await f.post({action:'complete',id})).status,200);assert.deepEqual(f.calls,['recover',['settle','user_fixture',id,true]]);
  assert.equal((await f.post({action:'reserve',quoteId:other,consent:true})).status,200);
});
