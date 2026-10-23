import Papa from "papaparse";
import { callingCountries, type DialingCountry } from "@/lib/calling-countries";
import { validateContact } from "@/lib/contact-validation";
import type { ContactInput } from "@/lib/contact-types";

export const importMaxBytes=512*1024;
export const importMaxRows=500;
export const importFields=["name","company","phone","country","notes"] as const;
export type ImportField=typeof importFields[number];
export type ImportMapping=Record<ImportField,number | null>;
export interface CsvContacts {headers:string[];records:string[][]}
export interface ImportRequest {action:"preview" | "import";csv:string;mapping:ImportMapping;defaultCountry:DialingCountry;selected?:number[]}
export interface ImportRow {record:number;contact:ContactInput | null;status:"ready" | "invalid" | "duplicate" | "imported" | "skipped";reason:string}
export interface ImportReport {rows:ImportRow[];ready:number;rejected:number;imported:number}

export function parseContactCsv(csv:string):CsvContacts {
  if (!csv.trim()) throw new Error("Choose a CSV file with a header and at least one contact.");
  if (new TextEncoder().encode(csv).length>importMaxBytes) throw new Error("The CSV file must be 512 KB or smaller.");
  if (csv.includes("\0")) throw new Error("The CSV contains unsupported null characters. Save it as UTF-8 CSV and retry.");
  const result=Papa.parse<string[]>(csv,{header:false,dynamicTyping:false,skipEmptyLines:"greedy",preview:importMaxRows+2,delimitersToGuess:[",",";","\t"]});
  if (result.errors.length) throw new Error("The CSV could not be read. Check delimiters and quoted fields, then save it as UTF-8 CSV.");
  const [headers,...records]=result.data;
  if (!headers || headers.length<2 || !records.length) throw new Error("Include a header, separate name and phone columns, and at least one contact.");
  if (records.length>importMaxRows || result.meta.truncated) throw new Error("Import up to 500 contacts at a time.");
  const sourceHeaders=headers.filter((value)=>!["_veilcall_record","_veilcall_reason"].includes(value));
  if (sourceHeaders.length>30 || headers.length>32 || records.some((row)=>row.length>32) || headers.some((value)=>value.length>160)) throw new Error("Use up to 30 source columns with headers no longer than 160 characters.");
  return {headers,records};
}
export function suggestMapping(headers:string[]):ImportMapping {
  const aliases:Record<ImportField,string[]>={name:["name","fullname","contactname"],company:["company","organisation","organization","business"],phone:["phone","phonenumber","mobile","telephone"],country:["country","countrycode"],notes:["notes","note","description"]};
  return Object.fromEntries(importFields.map((field)=>{const index=headers.findIndex((header)=>aliases[field].includes(header.toLowerCase().replace(/[^a-z]/g,"")));return [field,index<0 ? null : index];})) as ImportMapping;
}
export function validateImportRequest(value:unknown):{request:ImportRequest;document:CsvContacts} {
  if (!value || typeof value!=="object") throw new Error("Choose a CSV file and map its columns.");
  const input=value as Record<string,unknown>;
  if ((input.action!=="preview" && input.action!=="import") || typeof input.csv!=="string" ||
    !input.mapping || typeof input.mapping!=="object" || !callingCountries.some((item)=>item.code===input.defaultCountry)) throw new Error("Choose a CSV file, a supported default country, and column mappings.");
  const document=parseContactCsv(input.csv);
  const raw=input.mapping as Record<string,unknown>;
  const used=new Set<number>();
  const mapping={} as ImportMapping;
  for (const field of importFields) {
    const column=raw[field];
    if (column===null && field!=="name" && field!=="phone") {mapping[field]=null;continue;}
    if (typeof column!=="number" || !Number.isInteger(column) || column<0 || column>=document.headers.length || used.has(column)) throw new Error("Map name and phone, and use a different column for each field.");
    mapping[field]=column;used.add(column);
  }
  let selected:number[] | undefined;
  if (input.action==="import") {
    if (!Array.isArray(input.selected) || !input.selected.length || input.selected.length>importMaxRows ||
      input.selected.some((record)=>!Number.isInteger(record) || record<2 || record>document.records.length+1) || new Set(input.selected).size!==input.selected.length) throw new Error("Preview the contacts and choose the ready rows before importing.");
    selected=input.selected as number[];
  }
  return {request:{action:input.action,csv:input.csv,mapping,defaultCountry:input.defaultCountry as DialingCountry,selected},document};
}
function csvCountry(value:string,fallback:DialingCountry):DialingCountry | null {
  const key=value.trim().toUpperCase().replace(/[.\s_-]+/g,"");
  if (!key) return fallback;
  const aliases:Record<string,DialingCountry>={US:"US",USA:"US",UNITEDSTATES:"US",UNITEDSTATESOFAMERICA:"US",CA:"CA",CAN:"CA",CANADA:"CA",GB:"GB",GBR:"GB",UK:"GB",UNITEDKINGDOM:"GB",GREATBRITAIN:"GB",AU:"AU",AUS:"AU",AUSTRALIA:"AU"};
  return aliases[key] ?? null;
}
export function mapImportRows(document:CsvContacts,mapping:ImportMapping,defaultCountry:DialingCountry):ImportRow[] {
  const seen=new Map<string,number>();
  return document.records.map((values,index)=>{
    const record=index+2;
    const rejected=(reason:string):ImportRow=>({record,contact:null,status:"invalid",reason});
    if (values.length!==document.headers.length) return rejected("The number of columns does not match the header.");
    const field=(name:ImportField)=>mapping[name]===null ? "" : values[mapping[name]!].trim();
    const country=csvCountry(field("country"),defaultCountry);
    if (!country) return rejected("Use US, CA, GB/UK, or AU in the country column.");
    const name=field("name"),company=field("company"),notes=field("notes");
    if (!name || name.length>120) return rejected("Name is required and must be 120 characters or fewer.");
    if (company.length>160 || notes.length>5000) return rejected("Company must be 160 characters or fewer; notes up to 5,000.");
    // Spreadsheet-safe CSV exports may preserve an international phone as text.
    const phone=field("phone").replace(/^'(?=\+)/,"");
    const contact=validateContact({name,company,notes,phone,country});
    if (!contact) return rejected("Enter a valid phone number matching the selected country.");
    const earlier=seen.get(contact.phone);
    if (earlier) return {record,contact,status:"duplicate",reason:`Duplicate of record ${earlier} in this file.`};
    seen.set(contact.phone,record);
    return {record,contact,status:"ready",reason:"Ready to import."};
  });
}
export function importReport(rows:ImportRow[]):ImportReport {
  return {rows,ready:rows.filter((row)=>row.status==="ready").length,imported:rows.filter((row)=>row.status==="imported").length,rejected:rows.filter((row)=>!["ready","imported"].includes(row.status)).length};
}
export function rejectedContactsCsv(document:CsvContacts,rows:ImportRow[]):string {
  const headers=[...document.headers];
  const rejected=rows.filter((row)=>!["ready","imported"].includes(row.status));
  const width=Math.max(headers.length,...rejected.map((row)=>document.records[row.record-2].length));
  while(headers.length<width){let label=`_extra_column_${headers.length+1}`;while(headers.includes(label))label+="_";headers.push(label);}
  for (const field of ["_veilcall_record","_veilcall_reason"]) if (!headers.includes(field)) headers.push(field);
  const recordColumn=headers.indexOf("_veilcall_record"),reasonColumn=headers.indexOf("_veilcall_reason");
  const records=rejected.map((row)=>{
    const values=headers.map((_,index)=>document.records[row.record-2][index] ?? "");
    values[recordColumn]=String(row.record);values[reasonColumn]=row.reason;return values;
  });
  return "\uFEFF"+Papa.unparse({fields:headers,data:records},{escapeFormulae:/^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/});
}
export function contactCsvTemplate():string {
  return "\uFEFF"+Papa.unparse({fields:["name","company","phone","country","notes"],data:[["Alex Example","Example company","+442079460123","GB","Follow up about the proposal"]]},{escapeFormulae:true});
}
