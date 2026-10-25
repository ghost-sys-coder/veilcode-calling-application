import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {createRequire} from "node:module";
import test from "node:test";
import {loadModule} from "./support/load-typescript.mjs";
const require=createRequire(import.meta.url);
const config=loadModule("../src/lib/billing-config.ts",{"server-only":{},"@/lib/stripe-config":{getStripeMode:()=>"test"}});
const rates=loadModule("../src/lib/billing-rates.ts",{"server-only":{},"@/lib/billing-config":config});
const json=(data,status=200)=>Response.json(data,{status});
async function environment(values,run){const previous=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));try{for(const [key,value]of Object.entries(values)){if(value===undefined)delete process.env[key];else process.env[key]=value;}return await run();}finally{for(const [key,value]of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}}
const fixtureEnv={VEILCALL_BILLING_TEST_ENABLED:"true",STRIPE_TEST_MONTHLY_PRICE_ID:"price_fixture",STRIPE_TEST_WEBHOOK_SECRET:"whsec_"+randomBytes(24).toString("hex")};
const pilotImports={"@/lib/pilot-service":{},"@/lib/pilot-store":{},"@/lib/live-calling-store":{}};

test("billing is opt-in and defaults closed in live mode",async()=>{
  for(const mode of ["live","test"]){const current=loadModule("../src/lib/billing-config.ts",{"server-only":{},"@/lib/stripe-config":{getStripeMode:()=>mode}});
    await environment({...fixtureEnv,VEILCALL_BILLING_LIVE_ENABLED:"true"},()=>{assert.equal(current.liveBillingEnabled(),false);assert.equal(current.billingEnabled(),mode==="test");if(mode==="live")assert.throws(()=>current.requireTestBilling(),error=>error.status===409);});
  }
  await environment({VEILCALL_BILLING_TEST_ENABLED:undefined},()=>assert.throws(()=>config.requireTestBilling()));
  await environment({...fixtureEnv,STRIPE_TEST_WEBHOOK_SECRET:undefined},()=>assert.throws(()=>config.requireTestBilling(),error=>error.status===503));
});
test("billing return URLs must be a configured origin with HTTPS or local development",async()=>{
  for(const url of ["https://call.example.test","http://localhost:3000"]){await environment({NEXT_PUBLIC_SITE_URL:url},()=>assert.equal(config.billingOrigin(),url));}
  for(const url of ["http://public.example.test","https://user:secret@example.test","https://example.test/path","https://example.test?redirect=evil"])
    await environment({NEXT_PUBLIC_SITE_URL:url},()=>assert.throws(()=>config.billingOrigin()));
});
test("test rate cards classify ordinary UK/Australia landlines and mobiles and reject unsupported routes",()=>{
  for(const [phone,rate] of [["+442079460123",60000],["+447512345678",90000],["+61255500123",80000],["+61412345678",180000]]){
    const quote=rates.testCallingRate(phone,"+256772123456");assert.equal(quote.mode,"test");assert.equal(quote.rateMicro,rate);assert.equal(quote.feeMicro,10000);
  }
  for(const phone of ["+12125550123","+448001234567","+447012345678","+611900123456","+44 20 7946 0123","not a phone"])
    assert.throws(()=>rates.testCallingRate(phone,"+256772123456"));
});
test("reservations use integer money, minimum funding and five-minute limits; partial minutes round up",()=>{
  const quote=rates.testCallingRate("+442079460123","+256772123456");
  assert.deepEqual(rates.reservationAmounts(70000,quote),{maxSeconds:60,heldMicro:70000});
  assert.deepEqual(rates.reservationAmounts(10000000,quote),{maxSeconds:300,heldMicro:310000});
  for(const amount of [69999,-1,NaN,1.5])assert.throws(()=>rates.reservationAmounts(amount,quote));
  assert.equal(rates.usageCharge(0,60000,10000),10000);
  assert.equal(rates.usageCharge(1,60000,10000),70000);
  assert.equal(rates.usageCharge(60,60000,10000),70000);
  assert.equal(rates.usageCharge(61,60000,10000),130000);
  assert.throws(()=>rates.usageCharge(-1,60000,10000));
});
test("database approval and test balances never grant real calling access",async()=>{
  const guarded=loadModule("../src/lib/billing-call-access.ts",{...pilotImports,"@/lib/billing-store":{},"server-only":{},"@/lib/access":{isApprovedOperator:id=>id==="user_owner"},"@/lib/billing-config":config});
  await assert.doesNotReject(()=>guarded.requireRealCallingAccess("user_owner"));
  await assert.rejects(()=>guarded.requireRealCallingAccess("user_customer"),error=>error.status===402);
});

test("workspace access awaits owner review and fails closed during a customer storage outage",async()=>{
  let status="approved",failed=false,reads=0;
  const access=loadModule("../src/lib/access.ts",{"server-only":{},"@/lib/customer-access":{getOperatorAccess:async()=>{reads++;if(failed)throw new Error("storage unavailable");return {status};}}});
  await environment({CLERK_ALLOWED_USER_IDS:"user_owner"},async()=>{
    assert.equal(await access.operatorHasAccess(null),false);assert.equal(await access.operatorHasAccess("user_customer"),true);
    status="suspended";assert.equal(await access.operatorHasAccess("user_customer"),false);
    failed=true;assert.equal(await access.operatorHasAccess("user_customer"),false);
    const before=reads;assert.equal(await access.operatorHasAccess("user_owner"),true);assert.equal(reads,before);
  });
});

test("approved customers still receive no voice token or call permit before live billing launches",async()=>{
  const guard=loadModule("../src/lib/billing-call-access.ts",{...pilotImports,"@/lib/billing-store":{},"server-only":{},"@/lib/access":{isApprovedOperator:()=>false},"@/lib/billing-config":config});
  let providerReads=0;
  for(const [path,method]of [["token","GET"],["authorize","POST"]]){
    const handlers=loadModule(`../src/app/api/voice/${path}/route.ts`,{...pilotImports,"@/lib/number-access":{numberBody:request=>request.json()},"@clerk/nextjs/server":{auth:async()=>({userId:"user_customer"})},twilio:{},
      "@/lib/access":{operatorHasAccess:async()=>true},"@/lib/billing-call-access":guard,"@/lib/billing-config":config,
      "@/lib/voice-config":{getVoiceConfig:()=>{providerReads++;throw new Error("provider must not be used");}},"@/lib/voice-responses":{voiceJson:json,isSameOrigin:()=>true},
      "@/lib/operator-caller-ids":{},"@/lib/caller-ids":{},"@/lib/call-ticket":{},"@/lib/destination":{validateCallingDestination:()=>"+442079460123"}});
    const request=new Request(`https://app.test/api/voice/${path}`,{method,...(method==="POST"?{headers:{"content-type":"application/json"},body:JSON.stringify({to:"+442079460123"})}:{})});
    assert.equal((await handlers[method](request)).status,402);
  }
  assert.equal(providerReads,0);
});

function service({approved=true,admin=true,stripe={},store={},database={}}={}){
  return loadModule("../src/lib/billing-service.ts",{...pilotImports,"server-only":{},"@/lib/stripe":{stripeService:()=>stripe},"@/lib/stripe-config":{getStripeMode:()=>"test"},
    "@/lib/billing-config":config,"@/lib/access":{operatorHasAccess:async()=>approved},"@/lib/number-access":{isNumberAdmin:()=>admin},
    "@/lib/customer-access":{billingTransaction:async run=>run(database)},"@/lib/billing-store":store});
}
test("unapproved customers and ordinary operators cannot create even a test checkout",async()=>{
  await environment(fixtureEnv,async()=>{
    for(const options of [{approved:false},{admin:false}])await assert.rejects(service(options).startBillingCheckout("user_fixture","subscription"),error=>error.status===403);
    await assert.rejects(service().startBillingCheckout("user_fixture","topup",1234),error=>error.status===400);
    await assert.rejects(service().startBillingCheckout("user_fixture","topup","1000"),error=>error.status===400);
  });
});
test("checkout is server priced and customer owned, retries reuse frozen parameters and idempotency keys",async()=>{
  const creates=[],freezes=[];
  const order={id:"11111111-1111-4111-8111-111111111111",kind:"subscription",priceId:"price_fixture",amountCents:1900};
  const current=service({stripe:{prices:{retrieve:async()=>({id:"price_fixture",livemode:false,active:true,currency:"usd",unit_amount:1900,type:"recurring",recurring:{interval:"month",interval_count:1},billing_scheme:"per_unit"})},checkout:{sessions:{create:async(body,options)=>{creates.push({body,options});return {livemode:false,id:"cs_test_fixture",url:"https://checkout.stripe.com/c/pay/fixture"};}}}},
    store:{getBillingAccount:async()=>({id:"account",customerId:"cus_server",blocked:false}),createBillingOrder:async()=>order,billingOrderExpiry:async()=>2000000000,
      freezeCheckoutParameters:async(id,body)=>{freezes.push(id);return body;},attachBillingCheckout:async()=>{}}});
  await environment({...fixtureEnv,NEXT_PUBLIC_SITE_URL:"https://app.example.test"},async()=>{await current.startBillingCheckout("user_fixture","subscription",1);await current.startBillingCheckout("user_fixture","subscription",999999);});
  assert.deepEqual(creates[0],creates[1]);assert.equal(creates[0].body.customer,"cus_server");assert.equal(creates[0].body.line_items[0].price,"price_fixture");
  assert.equal(creates[0].body.payment_method_types,undefined);assert.equal(creates[0].body.automatic_tax,undefined);
  assert.equal(creates[0].body.success_url,"https://app.example.test/console/billing?checkout=returned");assert.match(creates[0].body.integration_identifier,/_[a-z]{8}$/);
});
test("webhooks require an authentic raw-body signature and reject live-mode events",async()=>{
  const Stripe=require("stripe"),stripe=new Stripe(["sk","test",randomBytes(20).toString("hex")].join("_")),current=service({stripe});
  await environment(fixtureEnv,async()=>{
    const body=JSON.stringify({id:"evt_fixture",type:"checkout.session.completed",livemode:false,data:{object:{id:"cs_fixture"}}});
    const signature=stripe.webhooks.generateTestHeaderString({payload:body,secret:process.env.STRIPE_TEST_WEBHOOK_SECRET});
    assert.equal(current.webhookEvent(body,signature).id,"evt_fixture");
    assert.throws(()=>current.webhookEvent(body+" ",signature),error=>error.status===400);
    const live=body.replace('"livemode":false','"livemode":true'),liveSignature=stripe.webhooks.generateTestHeaderString({payload:live,secret:process.env.STRIPE_TEST_WEBHOOK_SECRET});
    assert.throws(()=>current.webhookEvent(live,liveSignature),error=>error.status===403);
  });
});

test("a delayed unpaid checkout event cannot reopen a failed or expired order",async()=>{
  for(const terminal of ["failed","expired"]){let finalStatus;
    const current=service({stripe:{checkout:{sessions:{retrieve:async()=>({id:"cs_fixture",livemode:false,customer:"cus_fixture",client_reference_id:"order",currency:"usd",amount_total:1000,mode:"payment",status:"complete",payment_status:"unpaid"})}}},
      database:{query:async(sql,args)=>{
        if(sql.includes("FROM veilcall_billing_accounts"))return {rows:[{id:"account",customerId:"cus_fixture"}]};
        if(sql.includes("INSERT INTO veilcall_billing_events"))return {rowCount:1,rows:[]};
        if(sql.includes("FROM veilcall_billing_orders"))return {rows:[{id:"order",kind:"topup",amountCents:1000,status:terminal,checkoutId:"cs_fixture"}]};
        if(sql.includes("UPDATE veilcall_billing_orders")){finalStatus=args[2];return {rowCount:1,rows:[]};}
        throw new Error("Unexpected query");
      }}});
    await environment(fixtureEnv,()=>current.processBillingEvent({id:"evt_delayed",type:"checkout.session.completed",livemode:false,data:{object:{id:"cs_fixture",customer:"cus_fixture"}}}));
    assert.equal(finalStatus,terminal);
  }
});

test("billing, access review and simulation APIs authenticate before reading or writing",async()=>{
  for(const [path,method] of [["billing/route","GET"],["billing/checkout/route","POST"],["billing/portal/route","POST"],["billing/quote/route","POST"],["billing/simulate/route","POST"],["access/route","POST"],["access/review/route","GET"],["access/review/route","POST"]]){
    const handler=loadModule(`../src/app/api/${path}.ts`,{...pilotImports,"@/lib/billing-auth":{billingOperator:async()=>json({error:"Denied"},403)},
      "@/lib/customer-access":{},"@/lib/access":{},"@/lib/billing-config":{},"@/lib/stripe-config":{},"@/lib/number-access":{},"@/lib/billing-store":{},"@/lib/billing-service":{},"@/lib/billing-rates":{},"@/lib/operator-caller-ids":{},"@/lib/voice-responses":{voiceJson:json}});
    assert.equal((await handler[method](new Request("https://app.test/api",{method}))).status,403);
  }
});
test("raw webhook endpoint rejects oversized streaming bodies before processing",async()=>{
  let called=false;
  const auth=loadModule("../src/lib/billing-auth.ts",{"server-only":{},"@/lib/number-access":{},"@/lib/billing-config":config,"@/lib/voice-responses":{voiceJson:json}});
  const handler=loadModule("../src/app/api/billing/webhook/route.ts",{"@/lib/billing-auth":auth,"@/lib/billing-config":config,"@/lib/billing-service":{webhookEvent:()=>{called=true;}}});
  const result=await handler.POST(new Request("https://app.test/api/billing/webhook",{method:"POST",headers:{"content-type":"application/json"},body:"x".repeat(262145)}));
  assert.equal(result.status,413);assert.equal(called,false);
});
