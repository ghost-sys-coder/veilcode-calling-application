import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./support/load-typescript.mjs";
const countries=loadModule("../src/lib/calling-countries.ts");
const validation=loadModule("../src/lib/contact-validation.ts",{"@/lib/calling-countries":countries});
const id="b1234567-1234-4321-abcd-123456789abc";
const input={name:"  Alex Morgan  ",company:" Acme ",country:"GB",phone:"020 7946 0123",notes:" Call about scheduling. "};
const json=(body,status=200)=>Response.json(body,{status});
test("contacts normalize names, company, notes and international phone numbers",()=>{
  assert.deepEqual(validation.validateContact(input),{name:"Alex Morgan",company:"Acme",country:"GB",phone:"+442079460123",notes:"Call about scheduling."});
  for(const [country,phone,expected] of [["US","2125550123","+12125550123"],["CA","4165550123","+14165550123"],["AU","0412345678","+61412345678"]]) {
    assert.equal(validation.validateContact({...input,country,phone}).phone,expected);
  }
});
test("contact validation rejects blank names, unsupported countries, mismatched numbers and oversized fields",()=>{
  for(const value of [null,{}, {...input,name:" "},{...input,name:"a".repeat(121)},{...input,company:"a".repeat(161)},
    {...input,notes:"a".repeat(5001)},{...input,country:"UG"},{...input,country:"US"},{...input,phone:"+442079460123 ext 4"}]) assert.equal(validation.validateContact(value),null);
});
test("contact cursors validate the date and UUID before querying",()=>{
  assert.equal(validation.parseContactCursor(null),undefined);
  const value={date:"2026-10-23T10:00:00.123Z",id};
  assert.deepEqual(validation.parseContactCursor(Buffer.from(JSON.stringify(value)).toString("base64url")),value);
  for(const raw of ["a".repeat(301),"invalid",Buffer.from(JSON.stringify({date:"bad",id})).toString("base64url"),Buffer.from(JSON.stringify({...value,id:"' OR 1=1"})).toString("base64url")]) assert.throws(()=>validation.parseContactCursor(raw));
});
function collection({operator={userId:"user_test"},body=input,duplicate=false}={}) {
  let reads=0,writes=0;
  const route=loadModule("../src/app/api/contacts/route.ts",{
    "@/lib/review-auth":{reviewOperator:async()=>operator,reviewBody:async()=>body},
    "@/lib/contact-validation":validation,"@/lib/voice-responses":{voiceJson:json},
    "@/lib/contact-store":{listContacts:async(user,search)=>{assert.equal(user,"user_test");reads++;return {items:[],search};},createContact:async(user,data)=>{assert.equal(user,"user_test");writes++;if(duplicate)throw {code:"23505"};return {id,...data};}},
  });
  return {route,counts:()=>({reads,writes})};
}
test("contact collection requires approved authentication before reads or writes",async()=>{
  for(const status of [401,403]) {
    const {route,counts}=collection({operator:json({error:"Denied"},status)});
    assert.equal((await route.GET(new Request("https://app.test/api/contacts"))).status,status);
    assert.equal((await route.POST(new Request("https://app.test/api/contacts",{method:"POST"}))).status,status);
    assert.deepEqual(counts(),{reads:0,writes:0});
  }
});
test("contact creation validates input, returns normalized data and handles duplicate numbers safely",async()=>{
  const good=collection();
  const response=await good.route.POST(new Request("https://app.test/api/contacts",{method:"POST"}));
  assert.equal(response.status,201);assert.equal((await response.json()).phone,"+442079460123");
  const invalid=collection({body:{...input,name:""}});
  assert.equal((await invalid.route.POST(new Request("https://app.test/api/contacts",{method:"POST"}))).status,400);assert.equal(invalid.counts().writes,0);
  const duplicate=collection({duplicate:true});
  assert.equal((await duplicate.route.POST(new Request("https://app.test/api/contacts",{method:"POST"}))).status,409);
});
test("contact search rejects unbounded input and malformed cursors without touching storage",async()=>{
  const {route,counts}=collection();
  for(const suffix of [`?search=${"a".repeat(121)}`,"?cursor=invalid"]) assert.equal((await route.GET(new Request(`https://app.test/api/contacts${suffix}`))).status,400);
  assert.equal(counts().reads,0);
});
test("foreign contacts remain unavailable to detail, update and deletion routes",async()=>{
  const calls=[];
  const route=loadModule("../src/app/api/contacts/[contactId]/route.ts",{
    "@/lib/review-auth":{reviewOperator:async()=>({userId:"user_test"}),reviewBody:async()=>input},
    "@/lib/contact-validation":validation,"@/lib/voice-responses":{voiceJson:json},
    "@/lib/contact-store":Object.fromEntries(["getContact","updateContact","deleteContact"].map((method)=>[method,async(contactId,user)=>{calls.push({method,contactId,user});return null;}])),
  });
  for(const method of ["GET","PUT","DELETE"]) {
    assert.equal((await route[method](new Request("https://app.test/api/contacts/id",{method}),{params:Promise.resolve({contactId:id})})).status,404);
  }
  assert.ok(calls.every((call)=>call.contactId===id && call.user==="user_test"));
  const before=calls.length;
  assert.equal((await route.DELETE(new Request("https://app.test/api/contacts/id",{method:"DELETE"}),{params:Promise.resolve({contactId:"invalid"})})).status,400);
  assert.equal(calls.length,before);
});
