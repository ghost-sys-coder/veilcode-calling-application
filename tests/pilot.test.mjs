import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import test from 'node:test';
import {loadModule} from './support/load-typescript.mjs';
const config=loadModule('../src/lib/billing-config.ts',{'server-only':{},'@/lib/stripe-config':{getStripeMode:()=>'live'}});
const types=loadModule('../src/lib/pilot-types.ts'),routes=loadModule('../src/lib/rate-draft-types.ts');
const values=loadModule('../src/lib/pilot-values.ts',{'@/lib/billing-config':config,'@/lib/rate-draft-types':routes});
const legal=loadModule('../src/lib/legal-policies.ts');
const require=createRequire(import.meta.url);
const offer=()=>({...structuredClone(types.emptyPilotOffer),priceId:'price_fixture',operator:{name:'VeilCode Studio',country:'Uganda',address:'Fixture address',email:'test@example.invalid'},policiesApproved:true,taxReviewed:true,
  policies:{terms:'https://example.test/legal/terms',privacy:'https://example.test/legal/privacy',recording:'https://example.test/legal/recording',credit:'https://example.test/legal/credit',revision:legal.policyEdition},rates:{'+442079460124':{AU_MOBILE:{rateMicro:180000,feeMicro:10000}}}});
async function environment(settings,run){const previous={};try{for(const [key,value] of Object.entries(settings)){previous[key]=process.env[key];if(value===undefined)delete process.env[key];else process.env[key]=value;}return await run();}finally{for(const [key,value]of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}}

test('pilot defaults retain approved monthly and top-up amounts without publishing policies or call rates',()=>{
  assert.equal(types.emptyPilotOffer.monthlyCents,1900);assert.deepEqual(types.emptyPilotOffer.topups,[1000,2500,5000]);
  assert.deepEqual(types.emptyPilotOffer.rates,{});assert.equal(types.emptyPilotOffer.policiesApproved,false);
  assert.ok(values.pilotOfferIssues(types.emptyPilotOffer).length>=5);
  assert.deepEqual(values.pilotOfferIssues(values.pilotOfferInput(offer())),[]);
});
test('commercial setup rejects unsafe URLs, foreign routes, fractional money and unexpected configuration',()=>{
  for(const mutate of [o=>o.policies.terms='javascript:alert(1)',o=>o.policies.terms='https://user:pass@example.test/terms',o=>o.rates['+442079460124'].US_MOBILE={rateMicro:1,feeMicro:0},o=>o.monthlyCents=1900.5,o=>o.topups=[1000,1000],o=>o.rates['+442079460124'].AU_MOBILE.rateMicro=0,o=>o.operator.email='invalid',o=>o.enabled=true]){
    const candidate=offer();mutate(candidate);assert.throws(()=>values.pilotOfferInput(candidate));
  }
});
test('policy wording covers current calling, recordings, credit and consumer rights without inventing business contact details',()=>{
  const paragraphs=Object.fromEntries(legal.policyDocuments.map(doc=>[doc.key,legal.policySections(doc.key,types.emptyPilotOffer).flatMap(section=>section.paragraphs).join(' ')]));
  assert.match(paragraphs.terms,/one operator/);assert.match(paragraphs.terms,/not an emergency/);assert.match(paragraphs.terms,/UK and Australian/);
  assert.match(paragraphs.recording,/every participant/);assert.match(paragraphs.recording,/30 days/);assert.match(paragraphs.privacy,/Neon Postgres/);
  assert.match(paragraphs.credit,/does not itself waive/);assert.match(paragraphs.credit,/14 days/);assert.match(paragraphs.credit,/does not expire|do not expire/);
  assert.match(paragraphs.terms,/address to be supplied/);assert.match(paragraphs.terms,/email to be supplied/);
});
function pilotService({control={paused:true,revision:0,draft:null,active:null},enabled=true,stripe={},callers=[]}={}){
  return loadModule('../src/lib/pilot-service.ts',{'server-only':{},'@/lib/billing-config':{...config,liveBillingEnabled:()=>enabled,billingOrigin:()=>'https://example.test'},
    '@/lib/pilot-store':{pilotControl:async()=>control},'@/lib/pilot-values':values,'@/lib/stripe':{stripeService:()=>stripe},'@/lib/operator-caller-ids':{operatorCallerIds:async()=>callers},'@/lib/access':{operatorHasAccess:async()=>true},
    '@/lib/voice-config':{},'@/lib/voice-service':{},'@/lib/review-validation':{},'@/lib/legal-policies':legal});
}
test('a release flag cannot bypass missing or paused owner approval and a usable assigned route',async()=>{
  await assert.rejects(pilotService().requirePilotRelease(),error=>error.status===409);
  await assert.rejects(pilotService({enabled:false}).requirePilotRelease(),error=>error.status===402);
  const accountSid='AC'+'a'.repeat(32),release={id:'offer',config:offer(),providerAccountSid:accountSid};
  await environment({TWILIO_ACCOUNT_SID:accountSid},async()=>{
    const ready=pilotService({control:{paused:false,active:release}});
    await assert.rejects(ready.requirePilotCustomer('user_fixture'),error=>error.status===409);
    assert.equal((await pilotService({control:{paused:false,active:release},callers:[{number:'+442079460124'}]}).requirePilotCustomer('user_fixture')).id,'offer');
  });
});

function livePayments({accepted=true,stripe={},database={},store={},eligible=true}={}){
  return loadModule('../src/lib/billing-service.ts',{'server-only':{},'@/lib/stripe':{stripeService:()=>stripe},'@/lib/stripe-config':{getStripeMode:()=>'live'},'@/lib/billing-config':config,
    '@/lib/access':{operatorHasAccess:async()=>true},'@/lib/number-access':{},'@/lib/customer-access':{billingTransaction:async run=>run(database)},'@/lib/billing-store':store,
    '@/lib/pilot-service':{requirePilotCustomer:async()=>{if(!eligible)throw new config.BillingError('No usable calling route.',409);return {id:'offer_fixture',config:offer()};}},'@/lib/pilot-store':{policiesAccepted:async()=>accepted,policyServiceReady:async()=>accepted}});
}
const secret='whsec_'+randomBytes(24).toString('hex');
test('live checkout requires usable calling and accepted policies before any provider payment request',async()=>{
  await environment({STRIPE_PROD_WEBHOOK_SECRET:secret},async()=>{
    await assert.rejects(livePayments({accepted:false}).startBillingCheckout('user_fixture','subscription'),error=>error.status===409);
    await assert.rejects(livePayments({eligible:false}).startBillingCheckout('user_fixture','subscription'),error=>error.status===409);
    assert.throws(()=>livePayments().assertBillingObject({livemode:false}),error=>error.status===403);
  });
});
test('live top-ups use canonical owned charges and mode-scoped idempotency even with new commerce paused',async()=>{
  const events=new Set(),entries=[],queries=[];
  const account={id:'account',mode:'live',customerId:'cus_fixture'};
  const database={query:async(sql,args)=>{
    queries.push({sql,args});
    if(sql.includes('FROM veilcall_billing_accounts'))return {rows:[account]};
    if(sql.includes('INSERT INTO veilcall_billing_events')){const key=args.join(':');if(events.has(key))return {rowCount:0};events.add(key);return {rowCount:1};}
    if(sql.includes('FROM veilcall_billing_orders'))return {rows:[{id:'order',kind:'topup',amountCents:1000,status:'open',checkoutId:'cs_fixture',refunded:0}]};
    if(sql.includes('UPDATE veilcall_billing_orders'))return {rowCount:1};
    throw new Error('Unexpected query');
  }};
  let chargeOwner='cus_fixture';
  const canonical={checkout:{sessions:{retrieve:async()=>({id:'cs_fixture',livemode:true,customer:'cus_fixture',client_reference_id:'order',currency:'usd',amount_total:1000,mode:'payment',status:'complete',payment_status:'paid',payment_intent:'pi_fixture'})}},
    paymentIntents:{retrieve:async()=>({id:'pi_fixture',livemode:true,status:'succeeded',amount_received:1000,currency:'usd',customer:'cus_fixture',latest_charge:'ch_fixture'})},
    charges:{retrieve:async()=>({id:'ch_fixture',livemode:true,customer:chargeOwner,payment_intent:'pi_fixture',currency:'usd',amount:1000,amount_refunded:0,disputed:false})}};
  const service=livePayments({stripe:canonical,database,store:{accountFields:'id',appendBillingEntry:async(...args)=>entries.push(args)}});
  const event={id:'evt_live_fixture',livemode:true,type:'checkout.session.completed',data:{object:{id:'cs_fixture',customer:'cus_fixture'}}};
  await environment({STRIPE_PROD_WEBHOOK_SECRET:secret,VEILCALL_LIVE_BILLING_ENABLED:undefined},async()=>{
    await service.processBillingEvent(event);await service.processBillingEvent(event);
    assert.equal(entries.length,1);assert.equal(entries[0][4],10000000);
    assert.ok(queries.some(query=>query.sql.includes('mode=$2')&&query.args[1]==='live'));
    chargeOwner='cus_foreign';await assert.rejects(service.processBillingEvent({...event,id:'evt_wrong_owner'}),error=>error.status===403);assert.equal(entries.length,1);
  });
});
test('paid call permits carry a reservation binding and cannot be altered to select another hold',()=>{
  const tickets=loadModule('../src/lib/call-ticket.ts',{'server-only':{}}),secret=randomBytes(32).toString('hex'),id='11111111-1111-4111-8111-111111111111';
  const ticket=tickets.signCallTicket('user_fixture','+61412345678','+442079460124',secret,id);
  assert.equal(tickets.verifyCallTicket(ticket,secret).reservationId,id);
  const [payload,signature]=ticket.split('.'),data=JSON.parse(Buffer.from(payload,'base64url'));data.reservationId='22222222-2222-4222-8222-222222222222';
  assert.equal(tickets.verifyCallTicket(`${Buffer.from(JSON.stringify(data)).toString('base64url')}.${signature}`,secret),null);
});
test('paid authorization requires quote acceptance and signed TwiML consumes the bound reservation once',async()=>{
  const permit='11111111-1111-4111-8111-111111111111',to='+61412345678',from='+442079460124',key=randomBytes(32).toString('hex'),calls=[];
  const voice={accountSid:'AC'+'a'.repeat(32),authToken:'fixture',webhookUrl:'https://example.test/api/voice/twiml',signingSecret:key};
  const tickets=loadModule('../src/lib/call-ticket.ts',{'server-only':{}}),form=loadModule('../src/lib/voice-webhook.ts',{'server-only':{},'@/lib/voice-service':{}});
  const shared={'@/lib/access':{operatorHasAccess:async()=>true,isApprovedOperator:()=>false},'@/lib/billing-call-access':{requireRealCallingAccess:async()=>{}},'@/lib/call-ticket':tickets,
    '@/lib/caller-ids':{isApprovedCallerId:(value,allowed)=>allowed.some(item=>item.number===value)},'@/lib/operator-caller-ids':{operatorCallerIds:async()=>[{number:from}]},'@/lib/destination':{validateCallingDestination:value=>value===to?to:null},
    '@/lib/voice-config':{getVoiceConfig:()=>voice},'@/lib/billing-config':config,'@/lib/voice-responses':{voiceJson:(value,status=200)=>Response.json(value,{status}),isSameOrigin:()=>true}};
  const authorize=loadModule('../src/app/api/voice/authorize/route.ts',{...shared,'@clerk/nextjs/server':{auth:async()=>({userId:'user_fixture'})},'@/lib/number-access':{numberBody:request=>request.json()},
    '@/lib/live-calling-store':{reserveLiveQuote:async(user,quoteId,target,caller,consent)=>{assert.equal(user,'user_fixture');assert.equal(target,to);assert.equal(caller,from);if(quoteId!=='quote'||consent!==true)throw new config.BillingError('Accept quote.',400);calls.push('reserved');return permit;}}});
  const post=body=>authorize.POST(new Request('https://example.test/api/voice/authorize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
  assert.equal((await post({to,from})).status,400);assert.equal((await post({to,from,quoteId:'quote',consent:true,seconds:99999})).status,400);assert.equal(calls.length,0);
  const response=await post({to,from,quoteId:'quote',consent:true});assert.equal(response.status,200);const {ticket}=await response.json();
  let consumed=false;
  const twiml=loadModule('../src/app/api/voice/twiml/route.ts',{...shared,'@/lib/voice-webhook':form,'@/lib/review-call-tracking':{trackCall:async()=>true},
    '@/lib/twilio-settlement-service':{preparePrepaidTwilioCall:async(id,user,target,caller,parent)=>{assert.equal(id,permit);assert.equal(user,'user_fixture');assert.equal(target,to);assert.equal(caller,from);assert.match(parent,/^CA/);if(consumed)throw new config.BillingError('Used permit.',403);consumed=true;calls.push('redeemed');return '<Response><Dial timeLimit="300"/><Hangup/></Response>';}}});
  function providerRequest(value){const params={AccountSid:voice.accountSid,CallSid:'CA'+'b'.repeat(32),From:'client:user_fixture',Ticket:value,To:'+12125550123'};
    return new Request(voice.webhookUrl,{method:'POST',headers:{'X-Twilio-Signature':require('twilio').getExpectedTwilioSignature(voice.authToken,voice.webhookUrl,params)},body:new URLSearchParams(params)});}
  const allowed=await twiml.POST(providerRequest(ticket));assert.equal(allowed.status,200);assert.match(await allowed.text(),/timeLimit="300"/);
  assert.notEqual((await twiml.POST(providerRequest(ticket))).status,200);
  assert.equal((await twiml.POST(providerRequest(tickets.signCallTicket('user_fixture',to,from,key)))).status,403);
  assert.deepEqual(calls,['reserved','redeemed']);
});
test('live webhook signature uses the live secret and rejects a correctly signed test event',async()=>{
  const Stripe=require('stripe'),stripe=new Stripe(['sk','test',randomBytes(20).toString('hex')].join('_')),service=livePayments({stripe});
  await environment({STRIPE_PROD_WEBHOOK_SECRET:secret},async()=>{
    const body=JSON.stringify({id:'evt_fixture',type:'invoice.paid',livemode:true,data:{object:{id:'in_fixture'}}});
    const signature=stripe.webhooks.generateTestHeaderString({payload:body,secret});assert.equal(service.webhookEvent(body,signature).livemode,true);
    const swapped=body.replace('"livemode":true','"livemode":false'),signed=stripe.webhooks.generateTestHeaderString({payload:swapped,secret});
    assert.throws(()=>service.webhookEvent(swapped,signed),error=>error.status===403);assert.throws(()=>service.webhookEvent(body+' ',signature),error=>error.status===400);
  });
});
