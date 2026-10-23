import assert from "node:assert/strict";
import test from "node:test";
import {loadModule} from "./support/load-typescript.mjs";
const types=loadModule("../src/lib/dashboard-types.ts");
const validation=loadModule("../src/lib/dashboard-validation.ts",{"@/lib/dashboard-types":types});
const json=(value,status=200)=>Response.json(value,{status});
test("dashboard validates bounded periods and recognized named timezones",()=>{
  assert.deepEqual(validation.dashboardQuery(new URLSearchParams()),{range:"7d",timezone:"UTC"});
  for(const timezone of ["Africa/Kampala","America/New_York","Etc/GMT+3"])assert.equal(validation.dashboardQuery(new URLSearchParams({range:"today",timezone})).timezone,timezone);
  for(const params of [{range:"all"},{timezone:"Invalid/Timezone"},{timezone:"+03:00"},{timezone:"' OR true;--"},{timezone:"x".repeat(81)}])assert.equal(validation.dashboardQuery(new URLSearchParams(params)),null);
});
function dashboard({operator={userId:"user_test"},fail=false}={}) {
  let reads=0;
  const route=loadModule("../src/app/api/dashboard/route.ts",{
    "@/lib/review-auth":{reviewOperator:async()=>operator},"@/lib/dashboard-validation":validation,"@/lib/voice-responses":{voiceJson:json},
    "@/lib/dashboard-store":{getDashboard:async(user,range,timezone)=>{assert.equal(user,"user_test");assert.equal(range,"30d");assert.equal(timezone,"Africa/Kampala");reads++;if(fail)throw new Error("private database error");return {calls:10,finished:8,connected:4};}},
  });return {route,reads:()=>reads};
}
test("dashboard denies unauthenticated and unapproved operators before querying",async()=>{
  for(const status of [401,403]){const {route,reads}=dashboard({operator:json({},status)});assert.equal((await route.GET(new Request("https://app.test/api/dashboard"))).status,status);assert.equal(reads(),0);}
});
test("dashboard rejects malformed filters before storage and scopes valid requests",async()=>{
  const {route,reads}=dashboard();
  assert.equal((await route.GET(new Request("https://app.test/api/dashboard?range=unknown"))).status,400);assert.equal(reads(),0);
  const response=await route.GET(new Request("https://app.test/api/dashboard?range=30d&timezone=Africa%2FKampala"));assert.equal(response.status,200);assert.deepEqual(await response.json(),{calls:10,finished:8,connected:4});assert.equal(reads(),1);
});
test("dashboard failure responses do not reveal private errors or pretend metrics are zero",async()=>{
  const {route}=dashboard({fail:true});const response=await route.GET(new Request("https://app.test/api/dashboard?range=30d&timezone=Africa%2FKampala"));assert.equal(response.status,503);const data=await response.json();assert.match(data.error,/retry/i);assert.doesNotMatch(data.error,/private database/);assert.equal(data.calls,undefined);
});
