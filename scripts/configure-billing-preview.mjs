import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import {spawn} from "node:child_process";
createRequire(import.meta.url)("@next/env").loadEnvConfig(process.cwd());
const project=JSON.parse(await readFile(new URL("../.vercel/project.json",import.meta.url),"utf8"));
if(project.projectId!=="prj_dJKbzRZT7qUE6rU87Oc7AtqSwUf8" || project.orgId!=="team_24dtIFqfL1X7RkcGc6gVif0X")throw new Error("Use the linked VeilCall project.");
const cli="C:/nvm4w/nodejs/node_modules/vercel/dist/index.js";
const origin="https://veilcall-git-billing-pilot-ghostsyscoders-projects.vercel.app";
const testHost="ep-noisy-waterfall-b9lcv5rb.c-7.eu-central-1.aws.neon.tech";
const values=new Map();
for(const key of ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY","CLERK_SECRET_KEY","CLERK_ALLOWED_USER_IDS","VEILCALL_ADMIN_USER_IDS","TWILIO_CALLER_ID_OWNER_USER_ID","TWILIO_PHONE_NUMBER","TWILIO_CALLER_IDS","TWILIO_ACCOUNT_SID","STRIPE_TEST_MONTHLY_PRICE_ID","STRIPE_TEST_PORTAL_CONFIGURATION_ID","STRIPE_TEST_WEBHOOK_SECRET"]){
  const value=process.env[key];if(value)values.set(key,value);
}
for(const key of ["DATABASE_URL","DIRECT_DATABASE_URL"]){const url=new URL(process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL);url.hostname=testHost;values.set(key,url.toString());}
values.set("NEXT_PUBLIC_SITE_URL",origin);values.set("TWILIO_CALLING_ENABLED","false");values.set("VOICE_RECORDING_ENABLED","false");values.set("CALLBACK_EMAIL_ENABLED","false");
values.set("VEILCALL_BILLING_TEST_ENABLED",process.env.STRIPE_TEST_WEBHOOK_SECRET?.startsWith("whsec_")?"true":"false");
for(const [key,value]of values){
  const args=[cli,"env","add",key,"preview","billing-pilot","--scope","ghostsyscoders-projects","--yes","--non-interactive","--force","--sensitive"];
  const code=await new Promise(resolve=>{const child=spawn(process.execPath,args,{cwd:process.cwd(),env:{...process.env,NO_UPDATE_NOTIFIER:"1"},stdio:["pipe","pipe","pipe"],windowsHide:true});child.stdout.resume();child.stderr.resume();child.stdin.end(value);child.on("error",()=>resolve(1));child.on("close",code=>resolve(code));});
  if(code!==0)throw new Error(`Could not configure ${key}; secret output was suppressed.`);
  console.log(`Configured ${key} for billing-pilot Preview only.`);
}
console.log("Billing preview configuration is ready. Production variables were not changed.");
