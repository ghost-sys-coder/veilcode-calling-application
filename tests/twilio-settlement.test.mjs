import test from 'node:test';
import assert from 'node:assert/strict';
import twilio from 'twilio';
import {loadModule} from './support/load-typescript.mjs';

const account='AC'+'a'.repeat(32),parent='CA'+'a'.repeat(32),child='CA'+'b'.repeat(32),id='11111111-1111-4111-8111-111111111111';
const reservation={id,accountId:id,mode:'live',operatorId:'user_fixture',callSid:parent,status:'active',from:'+442079460123',to:'+61293744000',
  route:'Fixture',rateMicro:60000,feeMicro:10000,maxSeconds:300,heldMicro:310000,expiresAt:new Date(Date.now()+45000).toISOString()};
const evidence=loadModule('../src/lib/twilio-settlement-proof.ts',{'server-only':{}});
const config=loadModule('../src/lib/billing-config.ts',{'server-only':{},'@/lib/stripe-config':{getStripeMode:()=>'test'}});
const rules=loadModule('../src/lib/prepaid-rules.ts',{'server-only':{},'@/lib/billing-config':config,'@/lib/prepaid-types':loadModule('../src/lib/prepaid-types.ts')});
function proof(){return {source:'twilio-api',accountSid:account,
  parent:{sid:parent,accountSid:account,parentCallSid:null,from:'client:user_fixture',to:'',direction:'inbound',status:'completed',duration:'96'},
  child:{sid:child,accountSid:account,parentCallSid:parent,from:reservation.from,to:reservation.to,direction:'outbound-dial',status:'completed',duration:'61'}};}
test('canonical telephone seconds drive usage; a failed call needs explicit zero duration',()=>{
  assert.equal(evidence.twilioSettlementSeconds(reservation,account,proof()),61);
  const busy=proof();busy.child.status='busy';busy.child.duration='0';assert.equal(evidence.twilioSettlementSeconds(reservation,account,busy),0);
  for(const value of [null,undefined,'',0,61,'1.5','NaN','-1',' 0']){
    const pending=proof();pending.child.duration=value;
    assert.throws(()=>evidence.twilioSettlementSeconds(reservation,account,pending),error=>error.reason==='provider-pending');
  }
});
test('every provider account, operator, leg, destination and origin binding must match',()=>{
  for(const mutate of [p=>p.source='prepaid-test',p=>p.accountSid='AC'+'b'.repeat(32),p=>p.parent.accountSid='foreign',p=>p.child.accountSid='foreign',
    p=>p.parent.sid=child,p=>p.parent.from='client:other',p=>p.parent.parentCallSid=child,p=>p.parent.direction='outbound-api',
    p=>p.child.parentCallSid=child,p=>p.child.sid=parent,p=>p.child.to='+442079460124',p=>p.child.from='+442079460124',p=>p.child.direction='inbound']){
    const value=proof();mutate(value);assert.throws(()=>evidence.twilioSettlementSeconds(reservation,account,value),error=>error.review&&error.reason==='provider-mismatch');
  }
  assert.throws(()=>evidence.twilioSettlementSeconds({...reservation,mode:'test'},account,proof()));
  assert.throws(()=>evidence.twilioSettlementSeconds(reservation,'AC'+'0'.repeat(32),proof()));
});
test('unfinished legs wait; impossible durations require review; overruns reach the capped ledger',()=>{
  for(const leg of ['parent','child']){const value=proof();value[leg].status='in-progress';assert.throws(()=>evidence.twilioSettlementSeconds(reservation,account,value),error=>!error.review);}
  for(const mutate of [p=>p.parent.duration='10',p=>p.child.duration='86401',p=>p.child.status='busy',p=>p.parent.status='failed']){
    const value=proof();mutate(value);assert.throws(()=>evidence.twilioSettlementSeconds(reservation,account,value),error=>error.review&&error.reason==='duration-invalid');
  }
  const overrun=proof();overrun.child.duration='301';overrun.parent.duration='336';assert.equal(evidence.twilioSettlementSeconds(reservation,account,overrun),301);
});
function providerFixture({value=proof(),children,fail=false}={}){
  let calls=0;
  const api=Object.assign(()=>({fetch:async()=>{calls++;if(fail)throw new Error('private SDK URL');return value.parent;}}),
    {list:async params=>{calls++;assert.deepEqual(params,{parentCallSid:parent,limit:2});return children??[value.child];}});
  const provider=loadModule('../src/lib/twilio-settlement-provider.ts',{'server-only':{},'@/lib/voice-service':{voiceService:()=>({calls:api})},'@/lib/twilio-settlement-proof':evidence});
  return {provider,calls:()=>calls};
}
test('the provider adapter refuses test wallets and changed accounts before contacting Twilio',async()=>{
  const original=process.env.TWILIO_ACCOUNT_SID;process.env.TWILIO_ACCOUNT_SID=account;
  try{
    const fixture=providerFixture();await assert.rejects(fixture.provider.fetchTwilioSettlement({...reservation,mode:'test'},account));
    await assert.rejects(fixture.provider.fetchTwilioSettlement(reservation,'AC'+'b'.repeat(32)));assert.equal(fixture.calls(),0);
    const result=await fixture.provider.fetchTwilioSettlement(reservation,account);assert.equal(result.seconds,61);assert.equal(result.proof.source,'twilio-api');assert.equal(fixture.calls(),2);
  }finally{if(original===undefined)delete process.env.TWILIO_ACCOUNT_SID;else process.env.TWILIO_ACCOUNT_SID=original;}
});
test('missing, multiple and foreign child records cannot turn into a guessed charge',async()=>{
  const original=process.env.TWILIO_ACCOUNT_SID;process.env.TWILIO_ACCOUNT_SID=account;
  try{
    for(const [children,reason] of [[[],'provider-pending'],[[proof().child,proof().child],'provider-mismatch'],[[{...proof().child,parentCallSid:child}],'provider-mismatch']]){
      const fixture=providerFixture({children});await assert.rejects(fixture.provider.fetchTwilioSettlement(reservation,account),error=>error.reason===reason);
    }
    const failed=providerFixture({fail:true});await assert.rejects(failed.provider.fetchTwilioSettlement(reservation,account),error=>error.reason==='provider-unavailable'&&!error.message.includes('private'));
  }finally{if(original===undefined)delete process.env.TWILIO_ACCOUNT_SID;else process.env.TWILIO_ACCOUNT_SID=original;}
});
function serviceFixture({enabled=false,failure,settled=false,caller=reservation.from,markFail=false,deferFail=false}={}){
  const calls=[];const job={reservation:{...reservation,status:settled?'settled':'active'},accountSid:account,lease:id,attempts:1};
  const service=loadModule('../src/lib/twilio-settlement-service.ts',{'server-only':{},'@/lib/billing-config':{...config,liveBillingEnabled:()=>enabled},
    '@/lib/operator-caller-ids':{operatorCallerIds:async()=>[{number:caller}]},'@/lib/voice-service':{voiceWebhookUrl:path=>'https://app.test'+path},
    '@/lib/billing-store':{settleBillingReservation:async(...args)=>calls.push(['settle',...args])},'@/lib/prepaid-rules':rules,'@/lib/twilio-settlement-proof':evidence,
    '@/lib/twilio-settlement-provider':{fetchTwilioSettlement:async()=>{calls.push(['fetch']);if(failure)throw failure;return {seconds:61,proof:proof()};}},
    '@/lib/twilio-settlement-store':{bindTwilioReservation:async()=>{calls.push(['bind']);return reservation;},claimTwilioSettlements:async()=>[job],
      finishTwilioSettlement:async()=>{calls.push(['done']);if(markFail)throw new Error('interrupted');},deferTwilioSettlement:async(...args)=>{calls.push(['defer',...args]);if(deferFail)throw new Error('storage unavailable');}},
  });return {service,calls};
}
test('the shipped live-admission boundary blocks before caller, permit or Twilio access',async()=>{
  const fixture=serviceFixture();await assert.rejects(fixture.service.preparePrepaidTwilioCall(id,'user_fixture',reservation.to,reservation.from,parent),error=>error.status===402);assert.equal(fixture.calls.length,0);
  const revoked=serviceFixture({enabled:true,caller:'+442079460124'});await assert.rejects(revoked.service.preparePrepaidTwilioCall(id,'user_fixture',reservation.to,reservation.from,parent),error=>error.status===403);assert.equal(revoked.calls.length,0);
  assert.equal(config.liveBillingEnabled(),false);
});
test('future admission renders one capped, unrecorded destination with signed callback URLs',async()=>{
  const fixture=serviceFixture({enabled:true});const xml=await fixture.service.preparePrepaidTwilioCall(id,'user_fixture',reservation.to,reservation.from,parent);
  assert.match(xml,/timeLimit="300"/);assert.match(xml,/timeout="30"/);assert.match(xml,/record="do-not-record"/);
  assert.match(xml,/action="https:\/\/app.test\/api\/voice\/prepaid\/callback"/);assert.match(xml,/statusCallbackEvent="completed"/);assert.match(xml,/<Hangup\/>/);assert.equal(fixture.calls[0][0],'bind');
});
test('canonical proof settles once through the ledger; interrupted job completion can recover without fetching again',async()=>{
  const fixture=serviceFixture();assert.deepEqual(await fixture.service.reconcileTwilioSettlements(),{processed:1,settled:1,pending:0});
  const call=fixture.calls.find(item=>item[0]==='settle');assert.equal(call[2],parent);assert.equal(call[3],61);assert.equal(call[4],child);assert.equal(call[5].simulation,false);
  const recovered=serviceFixture({settled:true});await recovered.service.reconcileTwilioSettlements();assert.deepEqual(recovered.calls,[['done']]);
  const interrupted=serviceFixture({markFail:true});assert.equal((await interrupted.service.reconcileTwilioSettlements()).pending,1);assert.equal(interrupted.calls.at(-1)[0],'defer');
});
test('provider failures retain holds and quarantine mismatches rather than settling',async()=>{
  for(const [reason,review] of [['provider-pending',false],['provider-mismatch',true],['duration-invalid',true]]){
    const fixture=serviceFixture({failure:new evidence.SettlementEvidenceError(reason,review)});await fixture.service.reconcileTwilioSettlements();
    assert.equal(fixture.calls.some(call=>call[0]==='settle'),false);assert.equal(fixture.calls.at(-1)[2],reason);assert.equal(fixture.calls.at(-1)[3],review);
  }
});
test('a failed retry write fails the worker instead of recording a successful recovery pass',async()=>{
  const fixture=serviceFixture({failure:new evidence.SettlementEvidenceError('provider-pending'),deferFail:true});
  await assert.rejects(fixture.service.reconcileTwilioSettlements(),/storage is temporarily unavailable/);
});
function callbackFixture(params){
  const wakes=[],after=[];let reconciled=0;
  const route=loadModule('../src/app/api/voice/prepaid/callback/route.ts',{'next/server':{after:callback=>after.push(callback)},
    '@/lib/voice-webhook':{verifiedVoiceWebhook:async(_request,path)=>{assert.equal(path,'/api/voice/prepaid/callback');return params;}},
    '@/lib/twilio-settlement-store':{wakeTwilioSettlement:async(...args)=>wakes.push(args)},'@/lib/twilio-settlement-service':{reconcileTwilioSettlements:async()=>{reconciled++;}},
  });return {route,wakes,after,reconciled:()=>reconciled};
}
test('only signed terminal callbacks can wake work, and callback durations never reach settlement',async()=>{
  for(const params of [null,{AccountSid:account,ParentCallSid:parent,CallSid:child,CallStatus:'ringing'},
    {AccountSid:account,ParentCallSid:parent,CallSid:parent,CallStatus:'completed'}]){
    const f=callbackFixture(params);assert.ok((await f.route.POST(new Request('https://app.test',{method:'POST'}))).status>=400);assert.equal(f.wakes.length,0);
  }
  const f=callbackFixture({AccountSid:account,ParentCallSid:parent,CallSid:child,CallStatus:'completed',CallDuration:'999999',price:'0'});
  assert.equal((await f.route.POST(new Request('https://app.test',{method:'POST'}))).status,204);assert.deepEqual(f.wakes,[[account,parent]]);
  await f.after[0]();assert.equal(f.reconciled(),1);
  const action=callbackFixture({AccountSid:account,CallSid:parent,DialCallSid:child,DialCallStatus:'completed'});
  const reply=await action.route.POST(new Request('https://app.test',{method:'POST'}));assert.equal(reply.status,200);assert.match(await reply.text(),/<Hangup\/>/);
});
test('owner recovery rejects other users and browser-supplied settlement fields',async()=>{
  for(const denied of [401,403,0]){
    let runs=0;
    const route=loadModule('../src/app/api/admin/call-settlements/route.ts',{'@/lib/number-access':{numberOperator:async()=>denied?Response.json({}, {status:denied}):{userId:'owner'}},
      '@/lib/settlement-review-store':{settlementReport:async()=>({pending:0,due:0,review:0,done:0})},'@/lib/billing-config':config,
      '@/lib/twilio-settlement-service':{reconcileTwilioSettlements:async()=>{runs++;return {processed:0,settled:0,pending:0};}},'@/lib/voice-responses':{voiceJson:(value,status=200)=>Response.json(value,{status})}});
    assert.equal((await route.GET()).status,denied||200);
    assert.equal((await route.POST(new Request('https://app.test',{method:'POST',body:'{"seconds":0}'}))).status,denied||400);assert.equal(runs,0);
    assert.equal((await route.POST(new Request('https://app.test',{method:'POST'}))).status,denied||200);assert.equal(runs,denied?0:1);
    assert.equal((await route.POST(new Request('https://app.test',{method:'POST',body:''}))).status,denied||200);assert.equal(runs,denied?0:2);
    const streamed=new ReadableStream({start(controller){controller.enqueue(new Uint8Array());controller.enqueue(new TextEncoder().encode('{"seconds":0}'));controller.close();}});
    assert.equal((await route.POST(new Request('https://app.test',{method:'POST',body:streamed,duplex:'half'}))).status,denied||400);assert.equal(runs,denied?0:2);
  }
});
test('the prepaid webhook verifies the actual signature, exact callback URL and account before queue access',async()=>{
  const oldAccount=process.env.TWILIO_ACCOUNT_SID,oldToken=process.env.TWILIO_AUTH_TOKEN;
  process.env.TWILIO_ACCOUNT_SID=account;process.env.TWILIO_AUTH_TOKEN='fixture-token';
  const url='https://app.test/api/voice/prepaid/callback';
  const webhook=loadModule('../src/lib/voice-webhook.ts',{'server-only':{},'@/lib/voice-service':{voiceWebhookUrl:()=>url}});
  let wakes=0;
  const route=loadModule('../src/app/api/voice/prepaid/callback/route.ts',{'next/server':{after:()=>{}},'@/lib/voice-webhook':webhook,
    '@/lib/twilio-settlement-store':{wakeTwilioSettlement:async()=>{wakes++;}},'@/lib/twilio-settlement-service':{}});
  const params={AccountSid:account,CallSid:child,ParentCallSid:parent,CallStatus:'completed'};
  const sign=(address,body)=>twilio.getExpectedTwilioSignature('fixture-token',address,body);
  const request=(signature,body=params)=>new Request(url,{method:'POST',headers:{'X-Twilio-Signature':signature},body:new URLSearchParams(body)});
  try{
    for(const req of [request('bad'),request(sign('https://other.test/api/voice/prepaid/callback',params)),
      request(sign(url,params),{...params,AccountSid:'foreign'}),request(sign(url,params),[...Object.entries(params),['CallSid',child]])])assert.equal((await route.POST(req)).status,403);
    assert.equal(wakes,0);assert.equal((await route.POST(request(sign(url,params)))).status,204);assert.equal(wakes,1);
  }finally{
    if(oldAccount===undefined)delete process.env.TWILIO_ACCOUNT_SID;else process.env.TWILIO_ACCOUNT_SID=oldAccount;
    if(oldToken===undefined)delete process.env.TWILIO_AUTH_TOKEN;else process.env.TWILIO_AUTH_TOKEN=oldToken;
  }
});
