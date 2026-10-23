"use client";
import {useState} from "react";
import {Download,Upload} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {AlertDialog,AlertDialogAction,AlertDialogCancel,AlertDialogContent,AlertDialogDescription,AlertDialogFooter,AlertDialogHeader,AlertDialogTitle} from "@/components/ui/alert-dialog";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {NativeSelect,NativeSelectOption} from "@/components/ui/native-select";
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from "@/components/ui/table";
import {callingCountries,type DialingCountry} from "@/lib/calling-countries";
import {contactCsvTemplate,importFields,importMaxBytes,parseContactCsv,rejectedContactsCsv,suggestMapping,
  type CsvContacts,type ImportField,type ImportMapping,type ImportReport,type ImportRow} from "@/lib/contact-import";

const labels:Record<ImportField,string>={name:"Name",company:"Company",phone:"Phone number",country:"Country",notes:"Notes"};
function downloadCsv(name:string,csv:string){
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const link=document.createElement("a");link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function ContactImportDialog({onClose,onImported,onImportUncertain}:{onClose:()=>void;onImported:(count:number)=>void;onImportUncertain?:()=>void}) {
  const [source,setSource]=useState<{csv:string;name:string;document:CsvContacts} | null>(null);
  const [mapping,setMapping]=useState<ImportMapping | null>(null);
  const [defaultCountry,setDefaultCountry]=useState<DialingCountry>("US");
  const [report,setReport]=useState<ImportReport | null>(null);
  const [complete,setComplete]=useState(false);
  const [phase,setPhase]=useState<"idle"|"reading"|"preview"|"import">("idle");
  const [error,setError]=useState("");
  const [page,setPage]=useState(0);
  const [discard,setDiscard]=useState(false);
  const [attemptedImport,setAttemptedImport]=useState(false);
  const busy=phase!=="idle";
  function close(){if(busy)return;if(source && !complete)setDiscard(true);else onClose();}
  function reset(){setSource(null);setMapping(null);setReport(null);setComplete(false);setError("");setPage(0);setAttemptedImport(false);}
  async function request(action:"preview"|"import") {
    if (!source || !mapping || busy) return;
    setPhase(action);setError("");
    if(action==="import")setAttemptedImport(true);
    try {
      const response=await fetch("/api/contacts/import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,csv:source.csv,mapping,defaultCountry,
        ...(action==="import" ? {selected:report?.rows.filter((row)=>row.status==="ready").map((row)=>row.record)} : {})})});
      const data=await response.json();if(!response.ok)throw new Error(data.error || "The import request could not be completed.");
      setReport(data);setPage(0);
      if(action==="import"){setComplete(true);onImported(data.imported);}
    }catch(issue){setError(issue instanceof Error ? issue.message : "The import request could not be completed.");if(action==="import")onImportUncertain?.();}
    finally{setPhase("idle");}
  }
  function value(row:ImportRow,field:ImportField):string {
    if(row.contact)return row.contact[field];
    const column=mapping?.[field];return column===null || column===undefined ? "" : source?.document.records[row.record-2]?.[column] ?? "";
  }
  return <>
    <Dialog open onOpenChange={(open)=>{if(!open)close();}}><DialogContent className="contact-import-dialog" showCloseButton={!busy} onInteractOutside={(event)=>event.preventDefault()}>
      <DialogHeader><DialogTitle>Import contacts</DialogTitle><DialogDescription>Choose a CSV, match its columns, and review the contacts before saving.</DialogDescription></DialogHeader>
      <div className="contact-import-intro"><p>Up to 500 contacts · 512 KB · UTF-8 CSV with a header row</p><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={()=>downloadCsv("veilcall-contacts-template.csv",contactCsvTemplate())}><Download aria-hidden="true"/> Download template</Button></div>
      {!complete && <form onSubmit={(event)=>{event.preventDefault();void request("preview");}}>
        <fieldset disabled={busy} className="contact-import-fields">
          <div><Label htmlFor="contact-csv-file">CSV file</Label><Input id="contact-csv-file" type="file" accept=".csv,text/csv" onChange={async(event)=>{
            const file=event.target.files?.[0];event.currentTarget.value="";if(!file)return;
            reset();setPhase("reading");
            try {
              if(file.size>importMaxBytes)throw new Error("The CSV file must be 512 KB or smaller.");
              const csv=await file.text();const document=parseContactCsv(csv);
              setSource({csv,name:file.name,document});setMapping(suggestMapping(document.headers));
            }catch(issue){setError(issue instanceof Error ? issue.message : "The CSV file could not be read.");}
            finally{setPhase("idle");}
          }}/></div>
          {source && mapping && <>
            <p className="contact-import-file">{source.name} · {source.document.records.length} records</p>
            <div className="contact-import-mapping">{importFields.map((field)=><div key={field}><Label htmlFor={`csv-map-${field}`}>{labels[field]}{field==="name" || field==="phone" ? " *" : " (optional)"}</Label>
              <NativeSelect id={`csv-map-${field}`} value={mapping[field] ?? ""} onChange={(event)=>{setMapping((previous)=>({...previous!,[field]:event.target.value==="" ? null : Number(event.target.value)}));setReport(null);setError("");setPage(0);}}>
                <NativeSelectOption value="">{field==="name" || field==="phone" ? "Choose a column" : "Not mapped"}</NativeSelectOption>{source.document.headers.map((header,index)=><NativeSelectOption key={index} value={index}>{index+1} / {header || `Column ${index+1}`}</NativeSelectOption>)}
              </NativeSelect></div>)}
              <div><Label htmlFor="csv-default-country">Country for blank / unmapped values</Label><NativeSelect id="csv-default-country" value={defaultCountry} onChange={(event)=>{setDefaultCountry(event.target.value as DialingCountry);setReport(null);setError("");setPage(0);}}>{callingCountries.map((country)=><NativeSelectOption key={country.code} value={country.code}>{country.name} ({country.prefix})</NativeSelectOption>)}</NativeSelect></div>
            </div>
            <p className="contact-import-hint">Country accepts US, CA, GB/UK, AU, or their names. Local numbers use that country’s dialing rules.</p>
            <Button type="submit" variant="outline" disabled={mapping.name===null || mapping.phone===null || busy}>{phase==="preview" ? "Checking contacts…" : "Preview contacts"}</Button>
          </>}
        </fieldset>
      </form>}
      {error && <p className="review-message" role="alert">{error}</p>}
      <div role="status" aria-live="polite" className="contact-import-status">{phase==="reading" ? "Reading CSV…" : phase==="preview" ? "Validating rows and checking your contacts…" : phase==="import" ? "Importing contacts…" : complete && report ? `${report.imported} contacts imported. ${report.rejected} records skipped.` : report ? `${report.ready} ready to import. ${report.rejected} records need attention or are duplicates.` : ""}</div>
      {report && source && <section aria-label="Contact import preview" className="contact-import-preview">
        <div className="contact-import-summary"><h3>{complete ? "Import results" : "Preview"}</h3>{report.rejected>0 && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={()=>downloadCsv("veilcall-rejected-contacts.csv",rejectedContactsCsv(source.document,report.rows))}><Download aria-hidden="true"/> Download rejected rows</Button>}</div>
        <Table><TableHeader><TableRow><TableHead>Record</TableHead><TableHead>Contact</TableHead><TableHead>Phone / country</TableHead><TableHead>Notes</TableHead><TableHead>Result</TableHead></TableRow></TableHeader><TableBody>{report.rows.slice(page*50,(page+1)*50).map((row)=><TableRow key={row.record}>
          <TableCell>{row.record}</TableCell><TableCell><div className="contact-person"><strong>{value(row,"name").slice(0,120) || "—"}</strong><span>{value(row,"company").slice(0,160) || "—"}</span></div></TableCell><TableCell><div className="contact-number"><span>{value(row,"phone").slice(0,60) || "—"}</span><small>{value(row,"country").slice(0,60) || defaultCountry}</small></div></TableCell><TableCell><p className="contact-import-note" title={value(row,"notes").slice(0,5000)}>{value(row,"notes").slice(0,120) || "—"}</p></TableCell><TableCell><div className="contact-import-result"><strong data-status={row.status}>{row.status==="ready" ? "Ready" : row.status==="imported" ? "Imported" : row.status==="duplicate" ? "Duplicate" : row.status==="skipped" ? "Skipped" : "Invalid"}</strong><span>{row.reason}</span></div></TableCell>
        </TableRow>)}</TableBody></Table>
        {report.rows.length>50 && <div className="contact-import-pagination"><Button type="button" variant="outline" size="sm" disabled={busy || page===0} onClick={()=>setPage((value)=>value-1)}>Previous</Button><span>Page {page+1} of {Math.ceil(report.rows.length/50)}</span><Button type="button" variant="outline" size="sm" disabled={busy || (page+1)*50>=report.rows.length} onClick={()=>setPage((value)=>value+1)}>Next</Button></div>}
        <p className="contact-import-hint">Records are counted after the header; empty rows are ignored. Existing contacts stay as saved. Rejected downloads include the original columns and a reason.</p>
      </section>}
      <DialogFooter>
        {complete && <Button type="button" variant="outline" disabled={busy} onClick={reset}>Import another file</Button>}
        <Button type="button" variant="outline" disabled={busy} onClick={close}>{complete ? "Done" : "Cancel"}</Button>
        {!complete && report && <Button type="button" disabled={busy || report.ready===0} onClick={()=>void request("import")}><Upload aria-hidden="true"/>{phase==="import" ? "Importing…" : `Import ${report.ready} contact${report.ready===1 ? "" : "s"}`}</Button>}
      </DialogFooter>
    </DialogContent></Dialog>
    <AlertDialog open={discard} onOpenChange={setDiscard}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Close this import?</AlertDialogTitle><AlertDialogDescription>The selected file and preview will be cleared. {attemptedImport ? "An import was attempted; check Contacts for saved rows before retrying." : "Contacts have not been imported."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep reviewing</AlertDialogCancel><AlertDialogAction onClick={onClose}>Close import</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
