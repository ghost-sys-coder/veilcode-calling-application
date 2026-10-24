import {readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import Stripe from "stripe";
createRequire(import.meta.url)("@next/env").loadEnvConfig(process.cwd());
// Provision only test resources. No live credential is read by this script.
const key=process.env.STRIPE_TEST_API_KEY?.trim();
if(!/^(?:rk|sk)_test_[A-Za-z0-9]+$/.test(key??""))throw new Error("A test-mode Stripe key is required.");
if(!process.argv.includes("--provision"))throw new Error("Pass --provision to create or reuse the test-only catalog.");
const envPath=new URL("../.env.local",import.meta.url);
let contents=await readFile(envPath,"utf8");
const stripe=new Stripe(key,{telemetry:false,timeout:15000,maxNetworkRetries:1});
// Accept protected webhook URLs via stdin so automation secrets never appear
// in command-line arguments or terminal output.
if(process.argv.includes("--webhook-stdin")){
  let input="";for await(const chunk of process.stdin){input+=chunk;if(input.includes("\n"))break;}
  const value=JSON.parse(input);if(typeof value.url!=="string")throw new Error("A webhook URL is required.");
  process.argv.push("--webhook-url",value.url);
}
async function save(name,value){
  const line=`${name}=${JSON.stringify(value)}`,pattern=new RegExp(`^${name}=.*$`,"m");
  contents=pattern.test(contents)?contents.replace(pattern,line):contents.replace(/\s*$/,"")+`\n${line}\n`;
  await writeFile(envPath,contents,"utf8");process.env[name]=value;
}
try{
  const found=await stripe.prices.list({lookup_keys:["veilcall-sandbox-monthly-v1"],limit:1});
  let price=found.data[0];
  if(!price){
    const product=await stripe.products.create({name:"VeilCall Sandbox",description:"Test subscription fixture. Not a published commercial offer."},{idempotencyKey:"veilcall-sandbox-product-v1"});
    if(product.livemode)throw new Error("Live-mode resource rejected.");
    price=await stripe.prices.create({product:product.id,currency:"usd",unit_amount:1900,recurring:{interval:"month"},lookup_key:"veilcall-sandbox-monthly-v1"},{idempotencyKey:"veilcall-sandbox-monthly-price-v1"});
  }
  if(price.livemode || !price.active || price.currency!=="usd" || price.unit_amount!==1900 || price.recurring?.interval!=="month")throw new Error("Unexpected test price configuration.");
  await save("STRIPE_TEST_MONTHLY_PRICE_ID",price.id);
  let portalId=process.env.STRIPE_TEST_PORTAL_CONFIGURATION_ID;
  if(!portalId){
    const portal=await stripe.billingPortal.configurations.create({business_profile:{headline:"Manage your VeilCall test subscription"},
      features:{invoice_history:{enabled:true},payment_method_update:{enabled:true},subscription_cancel:{enabled:true,mode:"at_period_end"}}},
      {idempotencyKey:"veilcall-sandbox-portal-v1"});
    if(portal.livemode)throw new Error("Live-mode resource rejected.");
    portalId=portal.id;await save("STRIPE_TEST_PORTAL_CONFIGURATION_ID",portalId);
  }
  const index=process.argv.indexOf("--webhook-url");
  if(index>=0){
    const url=new URL(process.argv[index+1]);
    if(url.protocol!=="https:" || url.hostname!=="veilcall-git-billing-pilot-ghostsyscoders-projects.vercel.app" || url.pathname!=="/api/billing/webhook" || url.username || url.password ||
      [...url.searchParams.keys()].some(key=>key!=="x-vercel-protection-bypass"))
      throw new Error("Use the HTTPS billing webhook of the VeilCall preview deployment.");
    const endpoints=await stripe.webhookEndpoints.list({limit:100});
    let endpoint=endpoints.data.find(item=>item.url===url.toString());
    if(!endpoint){
      endpoint=await stripe.webhookEndpoints.create({url:url.toString(),api_version:Stripe.API_VERSION,description:"VeilCall billing sandbox only",enabled_events:[
        "checkout.session.completed","checkout.session.async_payment_succeeded","checkout.session.async_payment_failed","checkout.session.expired",
        "customer.subscription.created","customer.subscription.updated","customer.subscription.deleted","invoice.paid","invoice.payment_failed",
        "charge.refunded","charge.dispute.created","charge.dispute.closed"]},
        {idempotencyKey:`veilcall-sandbox-webhook-${createHash("sha256").update(url.toString()).digest("hex").slice(0,24)}`});
      if(endpoint.livemode || !endpoint.secret)throw new Error("Test webhook signing secret was not returned.");
      await save("STRIPE_TEST_WEBHOOK_SECRET",endpoint.secret);
    }else if(endpoint.livemode || !process.env.STRIPE_TEST_WEBHOOK_SECRET)throw new Error("The existing test endpoint needs its signing secret configured locally.");
  }
  if(process.env.STRIPE_TEST_WEBHOOK_SECRET?.startsWith("whsec_"))await save("VEILCALL_BILLING_TEST_ENABLED","true");
  console.log(JSON.stringify({testCatalogReady:true,testPortalReady:Boolean(portalId),testWebhookConfigured:Boolean(process.env.STRIPE_TEST_WEBHOOK_SECRET),livePaymentsEnabled:false,secretsPrinted:false}));
}catch(error){
  console.error(JSON.stringify({testSetupComplete:false,status:error.statusCode??null,code:error.code??null,secretsPrinted:false}));process.exitCode=1;
}
