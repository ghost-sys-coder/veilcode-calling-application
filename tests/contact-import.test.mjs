import assert from "node:assert/strict";
import test from "node:test";
import Papa from "papaparse";
import {loadModule} from "./support/load-typescript.mjs";
const countries=loadModule("../src/lib/calling-countries.ts");
const contactValidation=loadModule("../src/lib/contact-validation.ts",{"@/lib/calling-countries":countries});
const csv=loadModule("../src/lib/contact-import.ts",{"@/lib/calling-countries":countries,"@/lib/contact-validation":contactValidation});
const fields=["Name","Company","Phone","Country","Notes"];
const source="\uFEFF"+Papa.unparse({fields,data:[
  ['Alex "Morgan"','Acme, Inc','020 7946 0123','UK','First line\nSecond "quoted" line'],
  ['Duplicate','Acme','+442079460123','GB',''],['Wrong country','','+442079460124','US',''],
  ['','','2125550123','US',''],['Australia','','0412345678','Australia',''],['Canada','','4165550123','CAN',''],['US','','2125550123','USA',''],
]});
const mapping={name:0,company:1,phone:2,country:3,notes:4};
const input={action:"preview",csv:source,mapping,defaultCountry:"US"};
test("CSV parsing preserves BOM headers, quoted commas, escaped quotes, and multiline notes",()=>{
  const document=csv.parseContactCsv(source);assert.equal(document.headers[0],"Name");assert.equal(document.records.length,7);
  assert.equal(document.records[0][0],'Alex "Morgan"');assert.equal(document.records[0][1],'Acme, Inc');assert.equal(document.records[0][4],'First line\nSecond "quoted" line');
  assert.equal(csv.parseContactCsv('Name;Phone\r\nAlex;02079460123').records[0][1],'02079460123');
  assert.equal(csv.parseContactCsv('Name,Phone\n\nAlex,02079460123\n , \n').records.length,1);
});
test("CSV rejects malformed quoting, missing records, large files and excessive rows or columns",()=>{
  for(const value of ['', 'Name,Phone', 'Name,Phone\n"unfinished,123', 'Name,Phone\nAlex,12\0', 'x'.repeat(512*1024+1),
    'Name,Phone\n'+Array.from({length:501},()=>"Alex,02079460123").join('\n'), Array.from({length:31},(_,i)=>`Column${i}`).join(',')+'\n'+Array(31).fill('x').join(',')])assert.throws(()=>csv.parseContactCsv(value));
  assert.equal(csv.parseContactCsv('Name,Phone\n'+Array.from({length:500},()=>"Alex,02079460123").join('\n')).records.length,500);
});
test("mapping validates required, unique column indexes and explicit selected preview records",()=>{
  assert.deepEqual(csv.suggestMapping(fields),mapping);
  assert.equal(csv.validateImportRequest(input).document.records.length,7);
  for(const value of [null,{...input,mapping:{...mapping,name:null}},{...input,mapping:{...mapping,phone:0}},{...input,mapping:{...mapping,notes:10}},
    {...input,defaultCountry:"UG"},{...input,action:"import"},{...input,action:"import",selected:[2,2]},{...input,action:"import",selected:[500]}])assert.throws(()=>csv.validateImportRequest(value));
  assert.deepEqual(csv.validateImportRequest({...input,action:"import",selected:[2,6]}).request.selected,[2,6]);
});
test("mapped rows normalize all four countries and identify invalid rows and same-file duplicates",()=>{
  const rows=csv.mapImportRows(csv.parseContactCsv(source),mapping,"US");
  assert.equal(rows[0].contact.phone,"+442079460123");assert.equal(rows[1].status,"duplicate");assert.match(rows[1].reason,/record 2/);
  assert.equal(rows[2].status,"invalid");assert.equal(rows[3].status,"invalid");
  assert.equal(rows[4].contact.phone,"+61412345678");assert.equal(rows[5].contact.country,"CA");assert.equal(rows[6].contact.country,"US");
  assert.deepEqual({ready:csv.importReport(rows).ready,rejected:csv.importReport(rows).rejected},{ready:4,rejected:3});
  const fallback=csv.parseContactCsv('Name,Phone,Country\nAlex,02079460123,\nBad,02079460124,UG\nExtra,02079460125,GB,unexpected');
  const mapped=csv.mapImportRows(fallback,{name:0,company:null,phone:1,country:2,notes:null},"GB");assert.equal(mapped[0].contact.country,"GB");assert.equal(mapped[1].status,"invalid");assert.match(mapped[2].reason,/columns/);
  const rejected=Papa.parse(csv.rejectedContactsCsv(fallback,mapped),{header:true}).data;assert.equal(rejected[1]._extra_column_4,"unexpected");
});
test("rejected CSV preserves source columns and quotes while neutralizing spreadsheet formulas",()=>{
  const document=csv.parseContactCsv('Name,Phone,Notes\n"=SUM(1,2)",bad,"line one\nline two"\n  @bad,bad2,test');
  const rows=csv.mapImportRows(document,{name:0,phone:1,company:null,country:null,notes:2},"GB");
  const text=csv.rejectedContactsCsv(document,rows);const result=Papa.parse(text,{header:true}).data;
  assert.equal(result[0].Name,"'=SUM(1,2)");assert.equal(result[1].Name,"'  @bad");assert.equal(result[0].Notes,"line one\nline two");assert.equal(result[0]._veilcall_record,"2");assert.match(result[0]._veilcall_reason,/phone/);
  const template=csv.parseContactCsv(csv.contactCsvTemplate());assert.equal(csv.mapImportRows(template,csv.suggestMapping(template.headers),"US")[0].status,"ready");
});
const json=(body,status=200)=>Response.json(body,{status});
function route({operator={userId:"user_test"},existing=[],race=false}={}){
  let reads=0,writes=0;
  const api=loadModule("../src/app/api/contacts/import/route.ts",{
    "@/lib/review-auth":{reviewOperator:async(request)=>{assert.ok(request);return operator;}},"@/lib/contact-import":csv,"@/lib/voice-responses":{voiceJson:json},
    "@/lib/contact-import-store":{existingContactPhones:async(user)=>{assert.equal(user,"user_test");reads++;return new Set(existing);},importContacts:async(user,contacts)=>{assert.equal(user,"user_test");writes++;return new Set(contacts.filter((item)=>!race || item.country!=="CA").map((item)=>item.phone));}},
  });return {api,counts:()=>({reads,writes})};
}
const request=(body)=>new Request("https://app.test/api/contacts/import",{method:"POST",headers:{"Content-Type":"application/json",Origin:"https://app.test"},body:JSON.stringify(body)});
test("CSV imports enforce authentication before reading a file or touching storage",async()=>{
  for(const status of [401,403]){const {api,counts}=route({operator:json({},status)});assert.equal((await api.POST(request(input))).status,status);assert.deepEqual(counts(),{reads:0,writes:0});}
});
test("preview never writes and detects existing contacts only within the operator's scope",async()=>{
  const {api,counts}=route({existing:["+442079460123"]});const response=await api.POST(request(input));assert.equal(response.status,200);
  const report=await response.json();assert.equal(report.ready,3);assert.equal(report.rejected,4);assert.match(report.rows[0].reason,/already/);assert.deepEqual(counts(),{reads:1,writes:0});
});
test("import revalidates selected rows, handles concurrent duplicates, and never imports unselected rows",async()=>{
  const {api}=route({existing:["+442079460123"],race:true});
  const response=await api.POST(request({...input,action:"import",selected:[2,6,7]}));const report=await response.json();
  assert.equal(response.status,200);assert.equal(report.imported,1);assert.equal(report.rows[4].status,"imported");assert.equal(report.rows[5].status,"duplicate");assert.match(report.rows[5].reason,/before the import finished/);assert.equal(report.rows[6].status,"skipped");
});
test("CSV API rejects bad mappings, malformed CSV and oversized streamed requests before storage",async()=>{
  const {api,counts}=route();
  for(const body of [{...input,mapping:{}},{...input,csv:'Name,Phone\n"unfinished'}, {...input,action:"import",selected:[-1]}])assert.equal((await api.POST(request(body))).status,400);
  const big=new Request("https://app.test/api/contacts/import",{method:"POST",headers:{"Content-Type":"application/json"},body:' '.repeat(2*1024*1024+1)});assert.equal((await api.POST(big)).status,400);assert.deepEqual(counts(),{reads:0,writes:0});
});
