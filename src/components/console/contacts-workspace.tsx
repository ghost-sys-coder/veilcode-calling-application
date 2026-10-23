"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Pencil, Phone, Plus, Search, Trash2, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ContactFormDialog } from "@/components/console/contact-form-dialog";
import { callingCountries } from "@/lib/calling-countries";
import type { Contact, ContactPage } from "@/lib/contact-types";

const ContactImportDialog=dynamic(()=>import("@/components/console/contact-import-dialog").then((module)=>module.ContactImportDialog));

export function ContactsWorkspace({configured}:{configured:boolean}) {
  const [items,setItems]=useState<Contact[]>([]);
  const [search,setSearch]=useState("");
  const [query,setQuery]=useState("");
  const [revision,setRevision]=useState(0);
  const [loading,setLoading]=useState(configured);
  const [loadingMore,setLoadingMore]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [cursor,setCursor]=useState<string | null>(null);
  const [editor,setEditor]=useState<{contact:Contact | null} | null>(null);
  const [deleting,setDeleting]=useState<Contact | null>(null);
  const [deleteBusy,setDeleteBusy]=useState(false);
  const [importing,setImporting]=useState(false);

  useEffect(()=>{
    if (!configured) return;
    const controller=new AbortController();
    async function load() {
      try {
        const response=await fetch(`/api/contacts?search=${encodeURIComponent(query)}`,{cache:"no-store",signal:controller.signal});
        const data=await response.json();
        if (!response.ok) throw new Error(data.error || "Contacts could not be loaded.");
        if (!controller.signal.aborted) {setItems(data.items);setCursor(data.nextCursor);}
      } catch(issue) {if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : "Contacts are unavailable.");}
      finally {if (!controller.signal.aborted) setLoading(false);}
    }
    void load();return ()=>controller.abort();
  },[configured,query,revision]);
  function reload() {setLoading(true);setError("");setRevision((value)=>value+1);}
  const busy=loading || loadingMore;

  return <div className="contacts-page shell">
    <div className="history-title"><div><p className="dialer-eyebrow"><span className="dialer-blink"/> VEILCALL / ADDRESS BOOK</p><h1>People, remembered<span>.</span></h1><p>Keep the right number and a little context close at hand.</p></div>
      <div className="contacts-title-actions"><Button variant="outline" disabled={!configured || busy} onClick={()=>{setMessage("");setImporting(true);}}><Upload aria-hidden="true"/> Import CSV</Button><Button disabled={!configured || busy} onClick={()=>{setMessage("");setEditor({contact:null});}}><Plus aria-hidden="true"/> New contact</Button></div>
    </div>
    <form className="contacts-search" role="search" onSubmit={(event)=>{event.preventDefault();setLoading(true);setError("");setQuery(search.trim());setRevision((value)=>value+1);}}>
      <div><Search size={17} aria-hidden="true"/><Input aria-label="Search contacts" placeholder="Search by name, company, or number" maxLength={120} value={search} disabled={!configured || busy} onChange={(event)=>setSearch(event.target.value)}/></div>
      <Button type="submit" variant="outline" disabled={!configured || busy}>Search</Button>
      {query && <Button type="button" variant="ghost" disabled={busy} onClick={()=>{setSearch("");setQuery("");reload();}}>Clear</Button>}
    </form>
    <p className="contacts-feedback" role="status" aria-live="polite">{loading ? "Loading contacts…" : message}</p>
    {error && <div className="review-message" role="alert">{error}<Button variant="outline" size="sm" onClick={reload} disabled={busy}>Retry</Button></div>}
    {!configured ? <div className="history-empty"><h2>Your address book is almost ready.</h2><p>Contact storage has not been connected yet. You can keep calling from the dialer.</p></div>
      : !loading && !error && items.length===0 ? <div className="history-empty"><Users size={30}/><h2>{query ? "No contacts found." : "A familiar voice starts with a name."}</h2><p>{query ? "Try another name, company, or phone number." : "Save your first contact to keep their number, company, and notes together."}</p>{!query && <Button variant="outline" onClick={()=>setEditor({contact:null})}><Plus/> Add your first contact</Button>}</div>
      : items.length>0 && <div className="contacts-directory"><Table>
        <TableHeader><TableRow><TableHead>Contact</TableHead><TableHead>Phone &amp; country</TableHead><TableHead className="contacts-notes-heading">Notes</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
        <TableBody>{items.map((contact)=><TableRow key={contact.id}>
          <TableCell><div className="contact-person"><strong>{contact.name}</strong><span>{contact.company || "—"}</span></div></TableCell>
          <TableCell><div className="contact-number"><span>{contact.phone}</span><small>{callingCountries.find((item)=>item.code===contact.country)?.name}</small></div></TableCell>
          <TableCell className="contact-notes"><p title={contact.notes}>{contact.notes || "—"}</p></TableCell>
          <TableCell><div className="contact-actions">
            <Button asChild variant="outline" size="sm"><Link href={`/console?contact=${contact.id}`} aria-label={`Open ${contact.name} in dialer`}><Phone aria-hidden="true"/><span>Dial</span></Link></Button>
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${contact.name}`} disabled={busy} onClick={()=>setEditor({contact})}><Pencil aria-hidden="true"/></Button>
            <Button variant="ghost" size="icon-sm" aria-label={`Delete ${contact.name}`} disabled={busy} onClick={()=>{setMessage("");setDeleting(contact);}}><Trash2 aria-hidden="true"/></Button>
          </div></TableCell>
        </TableRow>)}</TableBody>
      </Table>{cursor && <div className="contacts-more"><Button variant="outline" disabled={busy} onClick={async()=>{
        setLoadingMore(true);setError("");
        try {
          const response=await fetch(`/api/contacts?search=${encodeURIComponent(query)}&cursor=${encodeURIComponent(cursor)}`,{cache:"no-store"});
          const data=await response.json() as ContactPage & {error?:string};
          if (!response.ok) throw new Error(data.error || "More contacts could not be loaded.");
          setItems((previous)=>[...previous,...data.items.filter((item)=>!previous.some((old)=>old.id===item.id))]);setCursor(data.nextCursor);
        } catch(issue) {setError(issue instanceof Error ? issue.message : "More contacts could not be loaded.");}
        finally {setLoadingMore(false);}
      }}>{loadingMore ? "Loading…" : "Load more contacts"}</Button></div>}</div>}
    <p className="history-footnote">Only your operator account can access these contacts. Opening the dialer fills in the number; you decide when to place the call.</p>
    {editor && <ContactFormDialog key={editor.contact?.id ?? "new"} contact={editor.contact} onClose={()=>setEditor(null)} onSaved={(contact)=>{
      setEditor(null);setMessage(`${contact.name} saved.`);setSearch("");setQuery("");reload();
    }}/>}
    {importing && <ContactImportDialog onClose={()=>setImporting(false)} onImportUncertain={reload} onImported={(count)=>{setMessage(`${count} contacts imported.`);setSearch("");setQuery("");reload();}}/>}
    <AlertDialog open={deleting !== null} onOpenChange={(open)=>{if (!open && !deleteBusy) setDeleting(null);}}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle><AlertDialogDescription>This permanently removes this contact and their contact notes. Past call history and call review notes remain.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel><Button variant="destructive" disabled={deleteBusy} onClick={async()=>{
          if (!deleting) return;
          setDeleteBusy(true);
          try {
            const response=await fetch(`/api/contacts/${deleting.id}`,{method:"DELETE"});
            const data=await response.json();if (!response.ok) throw new Error(data.error || "Contact could not be deleted.");
            setDeleting(null);setMessage("Contact deleted. Past call reviews are unchanged.");reload();
          } catch(issue) {setDeleting(null);setError(issue instanceof Error ? issue.message : "Contact could not be deleted.");}
          finally {setDeleteBusy(false);}
        }}>{deleteBusy ? "Deleting…" : "Delete contact"}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
