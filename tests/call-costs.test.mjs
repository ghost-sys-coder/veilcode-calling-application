import assert from 'node:assert/strict';
import test from 'node:test';
import {loadModule} from './support/load-typescript.mjs';
const types=loadModule('../src/lib/call-cost-types.ts');
const values=loadModule('../src/lib/call-cost-values.ts',{'@/lib/call-cost-types':types});
const parentSid='CA'+'a'.repeat(32),childSid='CA'+'b'.repeat(32),recordingSid='RE'+'c'.repeat(32),accountSid='AC'+'d'.repeat(32);
const source={callSid:parentSid,operatorId:'user_test',token:'lease'};
const entry=(sid,kind,amountMicro,currency='USD',status='completed')=>({sid,kind,status,durationSeconds:60,amountMicro,currency:amountMicro===null ? null : currency});
const json=(body,status=200)=>Response.json(body,{status});

test('provider prices retain decimal precision, zero, signed debit conventions and currency',()=>{
  for(const [price,amount] of [['-0.004',4000],['0.00250',2500],['-0.000001',1],['0',0],['+1.200000000',1200000]])
    assert.deepEqual(values.providerCost(price,'usd'),{amountMicro:amount,currency:'USD'});
  for(const [price,currency] of [[null,'USD'],['','USD'],['0.1',null],['NaN','USD'],['1e3','USD'],['0.0000001','USD'],['10000000000','USD'],['0.1','not-currency']])
    assert.equal(values.providerCost(price,currency),null);
  for(const value of [null,undefined,'',-1,1.5,'1.0',86401])assert.equal(values.providerDuration(value),null);
  assert.equal(values.providerDuration('0'),0);assert.equal(values.providerDuration('65'),65);
});
test('cost periods use inclusive UTC calendar days and reject unbounded queries',()=>{
  assert.equal(values.costRange(null),'30d');assert.equal(values.costRange('all'),null);
  assert.deepEqual(values.costPeriod('7d',new Date('2026-11-01T01:00:00Z')),{startDate:'2026-10-26',endDate:'2026-11-01'});
});
test('repeated snapshots do not duplicate charges or erase delayed/deleted recording prices',()=>{
  const previous=[entry(parentSid,'browser',4000),entry(recordingSid,'recording',2500)];
  const incoming=[entry(parentSid,'browser',4000),entry(recordingSid,'recording',null,null,'deleted'),entry(childSid,'telephone',15800)];
  const merged=values.mergeCostResources(previous,incoming);
  assert.equal(merged.length,3);assert.equal(merged.find(item=>item.sid===recordingSid).amountMicro,2500);
  assert.deepEqual(values.mergeCostResources(merged,incoming),merged);
  assert.deepEqual(values.sumCostResources(merged),[{currency:'USD',browserMicro:4000,telephoneMicro:15800,recordingMicro:2500,totalMicro:22300}]);
  const missingRecording=values.mergeCostResources(merged,[entry(parentSid,'browser',null,null,'in-progress')]);
  assert.equal(missingRecording.find(item=>item.sid===parentSid).status,'completed');
  assert.equal(missingRecording.find(item=>item.sid===recordingSid).amountMicro,2500);
  assert.throws(()=>values.mergeCostResources(previous,[entry(parentSid,'telephone',0)]));
});
test('mixed currencies remain separate and unpriced resources do not become zero charges',()=>{
  const totals=values.sumCostResources([entry(parentSid,'browser',4000,'USD'),entry(childSid,'telephone',10000,'GBP'),entry(recordingSid,'recording',null)]);
  assert.equal(totals.length,2);assert.equal(totals.find(item=>item.currency==='USD').totalMicro,4000);assert.equal(totals.find(item=>item.currency==='GBP').totalMicro,10000);
  assert.deepEqual(values.sumCostResources([entry(recordingSid,'recording',null)]),[]);
});
function serviceFixture({parentPatch={},childrenPatch,recordingsPatch,usagePatch,stored=[],fail=false}={}){
  let saved=null,failed=0,reads=0;
  const parent={sid:parentSid,accountSid,from:'client:user_test',parentCallSid:null,status:'completed',duration:'70',price:'-0.008',priceUnit:'USD',...parentPatch};
  const child={sid:childSid,accountSid,parentCallSid:parentSid,status:'completed',duration:'61',price:'-0.0316',priceUnit:'USD',from:'+442079460123',to:'+442079460124'};
  const recording={sid:recordingSid,accountSid,callSid:parentSid,status:'completed',duration:'60',price:'-0.0025',priceUnit:'USD'};
  const calls=()=>({fetch:async()=>{if(fail)throw new Error('private provider details');return parent;}});
  calls.list=async()=>{reads++;return childrenPatch??[child];};
  const client={calls,recordings:{list:async()=>{reads++;return recordingsPatch??[recording];}},usage:{records:{list:async()=>{const period=values.costPeriod('30d');return usagePatch??[{accountSid,category:'recordingstorage',price:'0.0005',priceUnit:'usd',startDate:new Date(period.startDate),endDate:new Date(period.endDate),asOf:new Date().toISOString()}];}}}};
  const service=loadModule('../src/lib/call-cost-service.ts',{'server-only':{},'@/lib/voice-service':{voiceService:()=>client},'@/lib/call-cost-values':values,
    '@/lib/call-cost-store':{claimCostCalls:async()=>[source],costRecordingReferences:async()=>stored,saveCallCosts:async(...args)=>{saved=args;},failCallCosts:async()=>{failed++;},dueCostCalls:async()=>0,saveStorageCost:async()=>{}},
  });
  return {service,saved:()=>saved,failed:()=>failed,reads:()=>reads};
}
async function withAccount(run){const old=process.env.TWILIO_ACCOUNT_SID;process.env.TWILIO_ACCOUNT_SID=accountSid;try{await run();}finally{if(old===undefined)delete process.env.TWILIO_ACCOUNT_SID;else process.env.TWILIO_ACCOUNT_SID=old;}}
test('provider reconciliation verifies ownership and captures both legs and recording charges',()=>withAccount(async()=>{
  const fixture=serviceFixture();await fixture.service.reconcileCallCost(source);
  const [,account,route,resources]=fixture.saved();assert.equal(account,accountSid);assert.match(route,/GB → GB fixed line/);
  assert.equal(resources.length,3);assert.equal(values.sumCostResources(resources)[0].totalMicro,42100);
}));
test('foreign callers, accounts and child associations are rejected before committing costs',()=>withAccount(async()=>{
  for(const patch of [{from:'client:user_other'},{accountSid:'AC'+'0'.repeat(32)},{parentCallSid:childSid},{sid:childSid}]){
    const fixture=serviceFixture({parentPatch:patch});await assert.rejects(fixture.service.reconcileCallCost(source));assert.equal(fixture.saved(),null);assert.equal(fixture.reads(),0);
  }
  const fixture=serviceFixture({childrenPatch:[{sid:childSid,accountSid,parentCallSid:'wrong'}]});await assert.rejects(fixture.service.reconcileCallCost(source));assert.equal(fixture.saved(),null);
  const wrongRecording=serviceFixture({recordingsPatch:[{sid:recordingSid,accountSid,callSid:childSid}]});await assert.rejects(wrongRecording.service.reconcileCallCost(source));assert.equal(wrongRecording.saved(),null);
}));
test('deleted recordings with no published price stay unknown and provider enumeration limits fail closed',()=>withAccount(async()=>{
  const fixture=serviceFixture({recordingsPatch:[],stored:[{sid:recordingSid,status:'deleted',duration:60}]});await fixture.service.reconcileCallCost(source);
  assert.equal(fixture.saved()[3].find(item=>item.sid===recordingSid).amountMicro,null);
  const large=serviceFixture({childrenPatch:Array(11).fill({})});await assert.rejects(large.service.reconcileCallCost(source));assert.equal(large.saved(),null);
}));
test('an undiscovered telephone leg stays incomplete even when the browser call is completed',()=>withAccount(async()=>{
  const fixture=serviceFixture({childrenPatch:[],recordingsPatch:[]});await fixture.service.reconcileCallCost(source);
  assert.equal(fixture.saved()[4],false);assert.equal(fixture.saved()[3][0].amountMicro,8000);
  const failed=serviceFixture({parentPatch:{status:'failed'},childrenPatch:[],recordingsPatch:[]});await failed.service.reconcileCallCost(source);assert.equal(failed.saved()[4],true);
}));
test('storage snapshots reject missing, wrong-account, wrong-category and wrong-period results',()=>withAccount(async()=>{
  const period=values.costPeriod('30d'),valid={accountSid,category:'recordingstorage',price:'0.0005',priceUnit:'usd',startDate:new Date(period.startDate),endDate:new Date(period.endDate),asOf:new Date().toISOString()};
  for(const usagePatch of [[],[{...valid,accountSid:'foreign'}],[{...valid,category:'calls'}],[{...valid,startDate:new Date('2000-01-01')}],[{...valid,price:null}],[valid,valid]]){
    const fixture=serviceFixture({usagePatch});assert.equal((await fixture.service.syncCallCosts('30d')).storageSynced,false);
  }
}));
test('provider outages preserve previous snapshots, release leases and report failed syncs',()=>withAccount(async()=>{
  const fixture=serviceFixture({fail:true});const result=await fixture.service.syncCallCosts('30d');
  assert.equal(result.synced,0);assert.equal(result.failed,1);assert.equal(fixture.saved(),null);assert.equal(fixture.failed(),1);
}));
function apiFixture({denied,status=200,fail=false}={}){
  let reads=0,writes=0;
  const route=loadModule('../src/app/api/admin/call-costs/route.ts',{
    '@/lib/number-access':{numberOperator:async(request,admin)=>{assert.equal(admin,true);return denied ? json({},status) : request?.headers.get('origin')!=='https://app.test' && request ? json({},403) : {userId:'user_owner'};}},
    '@/lib/call-cost-values':values,'@/lib/voice-responses':{voiceJson:json},
    '@/lib/call-cost-store':{getCallCostReport:async()=>{reads++;if(fail)throw new Error('private database credentials');return {calls:[]};}},
    '@/lib/call-cost-service':{syncCallCosts:async()=>{writes++;return {synced:1};}},
  });return {route,reads:()=>reads,writes:()=>writes};
}
test('cost APIs require an authenticated owner and same-origin writes before any provider or database work',async()=>{
  for(const status of [401,403]){const f=apiFixture({denied:true,status});assert.equal((await f.route.GET(new Request('https://app.test/api/admin/call-costs'))).status,status);assert.equal((await f.route.POST(new Request('https://app.test/api/admin/call-costs',{method:'POST'}))).status,status);assert.equal(f.reads()+f.writes(),0);}
  const f=apiFixture();assert.equal((await f.route.POST(new Request('https://app.test/api/admin/call-costs',{method:'POST',headers:{origin:'https://evil.test'}}))).status,403);assert.equal(f.writes(),0);
  assert.equal((await f.route.GET(new Request('https://app.test/api/admin/call-costs?range=all'))).status,400);assert.equal(f.reads(),0);
  assert.equal((await f.route.GET(new Request('https://app.test/api/admin/call-costs?range=30d'))).status,200);
  assert.equal((await f.route.POST(new Request('https://app.test/api/admin/call-costs?range=7d',{method:'POST',headers:{origin:'https://app.test'}}))).status,200);
});
test('cost API errors do not expose credentials or substitute zero costs for failures',async()=>{
  const {route}=apiFixture({fail:true});const response=await route.GET(new Request('https://app.test/api/admin/call-costs'));assert.equal(response.status,503);const data=await response.json();assert.doesNotMatch(data.error,/private|credentials/);assert.equal(data.totals,undefined);
});
test('terminal callbacks schedule cost capture after responding; active and invalid callbacks do not',async()=>{
  const callbacks=[];let status='completed',captures=0;
  const route=loadModule('../src/app/api/voice/calls/callback/route.ts',{
    '@/lib/voice-webhook':{verifiedVoiceWebhook:async()=>status==='invalid' ? null : {ParentCallSid:parentSid,CallSid:childSid,CallStatus:status,CallDuration:'60'}},
    '@/lib/review-db':{reviewDatabase:()=>({query:async()=>{}})},'@/lib/review-validation':{callSidPattern:/^CA[0-9a-f]{32}$/},
    'next/server':{after:callback=>callbacks.push(callback)},'@/lib/call-cost-service':{captureCallCost:async sid=>{assert.equal(sid,parentSid);captures++;}},
  });
  assert.equal((await route.POST(new Request('https://app.test/callback',{method:'POST'}))).status,204);assert.equal(captures,0);assert.equal(callbacks.length,1);await callbacks[0]();assert.equal(captures,1);
  status='in-progress';assert.equal((await route.POST(new Request('https://app.test/callback',{method:'POST'}))).status,204);assert.equal(callbacks.length,1);
  status='invalid';assert.equal((await route.POST(new Request('https://app.test/callback',{method:'POST'}))).status,403);assert.equal(callbacks.length,1);
});
