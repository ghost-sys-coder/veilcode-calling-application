import assert from 'node:assert/strict';
import test from 'node:test';
import {loadModule} from './support/load-typescript.mjs';
const types=loadModule('../src/lib/rate-draft-types.ts');
const values=loadModule('../src/lib/rate-draft-values.ts',{'@/lib/rate-draft-types':types});
const costTypes=loadModule('../src/lib/call-cost-types.ts');
const costs=loadModule('../src/lib/call-cost-values.ts',{'@/lib/call-cost-types':costTypes});
const samples=loadModule('../src/lib/rate-draft-sample.ts',{'server-only':{},'@/lib/call-cost-values':costs,'@/lib/rate-draft-types':types});
const parent='CA'+'a'.repeat(32),child='CA'+'b'.repeat(32),recording='RE'+'c'.repeat(32),from='+442079460124',account='AC'+'d'.repeat(32);
const resource=(sid,kind,amountMicro,seconds=61,currency='USD',status='completed')=>({sid,kind,amountMicro,durationSeconds:seconds,currency,status});
function call(to='+442079460123') {return {callSid:parent,to,checked:true,complete:true,failed:false,resources:[resource(parent,'browser',8000,96),resource(child,'telephone',31600),resource(recording,'recording',2500)]};}
const sample=rows=>samples.observedRateSample(rows,'2026-10-01','2026-10-30');
const payload={from,revision:0,rates:{GB_FIXED_LINE:{perMinute:'0.02',attempt:'0.01'}}};

test('USD draft input retains exact micro-units and rejects malformed, free or excessive per-minute rates',()=>{
  for(const [text,micro] of [['0.000001',1],['0.02105',21050],['1.000000',1000000],['100',100000000]])assert.equal(values.draftDollarMicro(text),micro);
  assert.equal(values.draftDollarMicro('0',true),0);assert.equal(values.draftDollarText(21050),'0.02105');assert.equal(values.draftDollarText(0),'0');
  for(const text of ['',0,'0','-1','NaN','Infinity','1e-2','0.0000001','100.000001','01',' 0.01 '])assert.throws(()=>values.draftDollarMicro(text));
  assert.deepEqual(values.draftSaveInput(payload),{from,revision:0,rates:{GB_FIXED_LINE:{rateMicro:20000,feeMicro:10000}}});
});
test('saving a draft accepts only known routes and cannot publish, alter credit or pass provider evidence',()=>{
  assert.deepEqual(values.draftSaveInput({...payload,rates:{}}).rates,{});
  for(const patch of [{publish:true},{accountId:'other'},{balanceMicro:10},{revision:-1},{revision:1.5},{revision:2147483647},{from:'invalid'},
    {rates:{US_MOBILE:{perMinute:'1',attempt:'0'}}},{rates:{GB_MOBILE:{perMinute:'0.1',attempt:'0',seconds:60}}}])
    assert.throws(()=>values.draftSaveInput({...payload,...patch}),error=>error.status===400);
});
test('sample checks use complete canonical telephone seconds and include both legs plus recording creation',()=>{
  const result=sample([call()]);assert.equal(result.observations[0].seconds,61);assert.equal(result.observations[0].supplierMicro,42100);assert.equal(result.observations[0].recorded,true);
  const coverage=values.rateCoverage(result.observations,'GB_FIXED_LINE',{rateMicro:20000,feeMicro:10000});
  assert.equal(coverage.revenueMicro,50000);assert.equal(coverage.differenceMicro,7900);assert.equal(coverage.losingCalls,0);assert.equal(coverage.minimumRateMicro,16050);
});
test('each call rounds separately; aggregate coverage cannot hide individual loss-making calls or attempt costs',()=>{
  const observations=[{route:'GB_FIXED_LINE',seconds:1,supplierMicro:10000,recorded:false},{route:'GB_FIXED_LINE',seconds:61,supplierMicro:180000,recorded:false},
    {route:'GB_FIXED_LINE',seconds:0,supplierMicro:11000,recorded:false}];
  const result=values.rateCoverage(observations,'GB_FIXED_LINE',{rateMicro:60000,feeMicro:10000});
  assert.equal(result.revenueMicro,210000);assert.equal(result.differenceMicro,9000);assert.equal(result.losingCalls,2);assert.equal(result.uncoveredAttempts,1);assert.equal(result.minimumRateMicro,85000);
  assert.equal(values.rateCoverage(observations,'AU_MOBILE',{rateMicro:10000,feeMicro:0}).calls,0);
  assert.equal(values.rateCoverage(observations,'GB_FIXED_LINE',undefined).revenueMicro,null);
});
test('missing prices, stale syncs, ambiguous leg enumeration and currencies outside USD never become coverage evidence',()=>{
  for(const mutate of [c=>c.checked=false,c=>c.complete=false,c=>c.failed=true,c=>c.resources[0].sid=child,c=>c.resources[1].amountMicro=null,
    c=>c.resources[1].status='in-progress',c=>c.resources.push({...c.resources[1]}),c=>c.resources[1].amountMicro=-1]){
    const row=call();mutate(row);const result=sample([row]);assert.equal(result.observations.length,0);assert.equal(result.excluded.incomplete,1);
  }
  const foreign=call();foreign.resources[1].currency='GBP';assert.equal(sample([foreign]).excluded.currency,1);
  const duration=call();duration.resources[1].durationSeconds=null;assert.equal(sample([duration]).excluded.duration,1);
  const busy=call();busy.resources[1].status='busy';assert.equal(sample([busy]).excluded.duration,1);
});
test('classification is limited to ordinary UK/Australia landline/mobile routes and 100 selected calls',()=>{
  const result=sample([call('+442079460123'),call('+447512345678'),call('+61293744000'),call('+61412345678'),call('+12025550123')]);
  assert.deepEqual(result.observations.map(item=>item.route),types.draftRoutes.map(item=>item.key));assert.equal(result.excluded.route,1);
  const bounded=sample(Array.from({length:101},()=>call()));assert.equal(bounded.examined,100);assert.equal(bounded.observations.length,100);assert.equal(bounded.hasMore,true);
  const zero=call();zero.resources.forEach(item=>item.amountMicro=0);assert.equal(sample([zero]).observations[0].supplierMicro,0);
});
test('caller ownership is checked before draft reads or writes and is rechecked on save',async()=>{
  const old=process.env.TWILIO_ACCOUNT_SID;process.env.TWILIO_ACCOUNT_SID=account;let owned=true;const events=[];
  const service=loadModule('../src/lib/rate-draft-service.ts',{'server-only':{},'@/lib/operator-caller-ids':{operatorCallerIds:async()=>owned?[{number:from,label:'Owned'}]:[]},
    '@/lib/call-cost-values':costs,'@/lib/rate-draft-types':types,'@/lib/rate-draft-values':values,'@/lib/rate-draft-store':{
      readRateDraft:async(...args)=>{events.push(['read',...args]);return {revision:0,rates:{},updatedAt:null};},rateDraftSample:async()=>sample([]),saveRateDraft:async(...args)=>events.push(['save',...args]),
    }});
  try{
    await assert.rejects(service.getRateDraftView('owner','+442079460125','30d'),error=>error.status===403);assert.equal(events.length,0);
    const view=await service.getRateDraftView('owner',null,'30d');assert.equal(view.from,from);assert.deepEqual(events[0],['read','owner',account,from]);
    owned=false;await assert.rejects(service.updateRateDraft('owner',payload),error=>error.status===403);assert.equal(events.some(item=>item[0]==='save'),false);
  }finally{if(old===undefined)delete process.env.TWILIO_ACCOUNT_SID;else process.env.TWILIO_ACCOUNT_SID=old;}
});
test('draft API authenticates before parsing/access and returns safe errors without a publish action',async()=>{
  let denied=401,body=payload,fail=false;const events=[];
  const route=loadModule('../src/app/api/admin/rate-drafts/route.ts',{'@/lib/number-access':{numberOperator:async()=>denied?Response.json({}, {status:denied}):{userId:'owner'},numberBody:async()=>{events.push('body');return body;},numberApiError:()=>Response.json({}, {status:400})},
    '@/lib/call-cost-values':costs,'@/lib/rate-draft-values':values,'@/lib/rate-draft-service':{getRateDraftView:async()=>{events.push('read');if(fail)throw new Error('private database URL');return {};},updateRateDraft:async(_owner,input)=>{events.push('save');return values.draftSaveInput(input);}},
    '@/lib/voice-responses':{voiceJson:(value,status=200)=>Response.json(value,{status})}});
  const get=new Request('https://app.test/api/admin/rate-drafts'),put=new Request(get.url,{method:'PUT'});
  for(const status of [401,403]){denied=status;assert.equal((await route.GET(get)).status,status);assert.equal((await route.PUT(put)).status,status);assert.equal(events.length,0);}
  denied=0;assert.equal((await route.GET(new Request(get.url+'?range=all'))).status,400);assert.equal(events.length,0);
  body={...payload,publish:true};assert.equal((await route.PUT(put)).status,400);
  fail=true;const response=await route.GET(get);assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/private/);
});
