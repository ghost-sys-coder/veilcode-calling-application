import assert from 'node:assert/strict';
import test from 'node:test';
import {loadModule} from './support/load-typescript.mjs';
const config=loadModule('../src/lib/billing-config.ts',{'server-only':{},'@/lib/stripe-config':{getStripeMode:()=>'live'}});
const routes=loadModule('../src/lib/rate-draft-types.ts');
const values=loadModule('../src/lib/rate-draft-values.ts',{'@/lib/rate-draft-types':routes});
const to='+447400123456',from='+442079460124',price={rateMicro:90000,feeMicro:10000};
const snapshot=(cost='0.03050',origin=from,destination=to)=>({destinationNumber:destination,originationNumber:origin,isoCountry:destination.startsWith('+61')?'AU':'GB',priceUnit:'USD',outboundCallPrices:[{currentPrice:cost,originationPrefixes:['ALL']}]});
function guard(fetch=async()=>snapshot()){
  return loadModule('../src/lib/voice-price-guard.ts',{'server-only':{},'@/lib/billing-config':config,'@/lib/rate-draft-values':values,
    '@/lib/voice-service':{voiceService:()=>({pricing:{v2:{voice:{numbers:destination=>({fetch:options=>fetch(destination,options)})}}}})}});
}
test('exact caller/destination prices admit ordinary UK/Australia rates with capture/storage/browser allowance',()=>{
  const {coveredVoicePrice:check}=guard();
  check(snapshot(),to,from,price);
  check(snapshot('0.0158',from,'+442079460123'),'+442079460123',from,{rateMicro:60000,feeMicro:10000});
  check(snapshot('0.0252',from,'+61293744000'),'+61293744000',from,{rateMicro:80000,feeMicro:10000});
  check(snapshot('0.075',from,'+61412345678'),'+61412345678',from,{rateMicro:180000,feeMicro:10000});
  check(snapshot('0'),to,from,price);
  assert.throws(()=>check(snapshot(),to,from,{rateMicro:37499,feeMicro:10000}),e=>e.status===409);
  assert.throws(()=>check(snapshot(),to,from,{rateMicro:90000,feeMicro:3999}),e=>e.status===409);
});
test('expensive mobile prefixes and caller surcharges cannot use a cheaper generic fallback',()=>{
  const {coveredVoicePrice:check}=guard();
  for(const amount of ['0.32','0.473','0.5577'])assert.throws(()=>check(snapshot(amount),to,from,price),e=>e.status===409);
  const origin='+256750242627',data=snapshot('0.0305',origin);
  data.outboundCallPrices.push({currentPrice:'0.473',originationPrefixes:['256']});
  assert.throws(()=>check(data,to,origin,price),e=>e.status===409);
  data.outboundCallPrices.reverse();assert.throws(()=>check(data,to,origin,price),e=>e.status===409);
});
test('unknown currency, mismatched identities and malformed or missing prices fail closed',()=>{
  const {coveredVoicePrice:check}=guard();
  const changes=[x=>x.destinationNumber=from,x=>x.originationNumber=to,x=>x.isoCountry='AU',x=>x.priceUnit='GBP',x=>x.outboundCallPrices=[],
    x=>x.outboundCallPrices[0].originationPrefixes=[],x=>x.outboundCallPrices[0].originationPrefixes=['256'],x=>x.outboundCallPrices[0].originationPrefixes=[null],
    ...[null,undefined,'-0.01','NaN','0.0000001',Infinity,NaN].map(value=>x=>x.outboundCallPrices[0].currentPrice=value)];
  for(const change of changes){const data=snapshot();change(data);assert.throws(()=>check(data,to,from,price),e=>e.status===503);}
});
test('provider requests bind the outgoing number and outages expose no raw provider details',async()=>{
  const calls=[];
  await guard(async(destination,options)=>{calls.push({destination,options});return snapshot();}).assertVoicePriceCovered(to,from,price);
  assert.deepEqual(calls,[{destination:to,options:{originationNumber:from}}]);
  await assert.rejects(guard(async()=>{throw Error('private provider response');}).assertVoicePriceCovered(to,from,price),e=>e.status===503&&!e.message.includes('private'));
});
test('paid admission checks supplier prices before saving a quote or changing held credit',async()=>{
  const account={id:'account',mode:'live',blocked:false,subscriptionStatus:'active',paidUntil:new Date(Date.now()+86400000).toISOString(),balanceMicro:10000000,heldMicro:0};
  for(const outcome of ['cost','outage','access','ok']){
    const queries=[],requests=[];
    const database={query:async(sql,args)=>{queries.push(sql);
      if(sql.includes('JOIN veilcall_pilot_offers'))return {rows:[{id:'offer',config:{rates:{[from]:{GB_MOBILE:price}}}}]};
      if(sql.includes('veilcall_operator_access'))return {rowCount:outcome==='access'?0:1};
      if(sql.includes('veilcall_caller_identities')||sql.includes('veilcall_policy_acceptances'))return {rowCount:1};
      if(sql.includes('SUM(charge_micro)'))return {rows:[{spent:0}]};
      if(sql.includes('INSERT INTO veilcall_prepaid_quotes'))return {rows:[{id:args[0],heldMicro:args[8]}]};
      throw Error('Unexpected query');
    }};
    const provider=guard(async()=>{requests.push('pricing');if(outcome==='outage')throw Error('outage');return snapshot(outcome==='cost'?'0.32':'0.03050');});
    const billingRates=loadModule('../src/lib/billing-rates.ts',{'server-only':{},'@/lib/billing-config':config});
    const live=loadModule('../src/lib/live-calling-store.ts',{'server-only':{},'@/lib/billing-config':{...config,liveBillingEnabled:()=>true},
      '@/lib/customer-access':{billingTransaction:run=>run(database)},'@/lib/billing-store':{getBillingAccount:async()=>account,lockBillingAccount:async()=>account,expireUnusedReservations:async()=>{}},
      '@/lib/billing-rates':billingRates,'@/lib/pilot-values':{pilotOfferIssues:()=>[]},'@/lib/rate-draft-types':routes,'@/lib/destination':{validateCallingDestination:value=>value},'@/lib/voice-price-guard':provider});
    if(outcome==='ok'){const quote=await live.createLiveQuote('user_fixture',to,from);assert.equal(quote.heldMicro,460000);}
    else await assert.rejects(live.createLiveQuote('user_fixture',to,from),e=>e.status===({cost:409,outage:503,access:403})[outcome]);
    assert.equal(queries.some(sql=>sql.includes('INSERT INTO veilcall_prepaid_quotes')),outcome==='ok');
    assert.equal(queries.some(sql=>sql.includes('UPDATE veilcall_billing_accounts')),false);
    assert.equal(requests.length,outcome==='access'?0:1);
  }
});
