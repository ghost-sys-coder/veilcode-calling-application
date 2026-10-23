"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { callingCountries, type DialingCountry } from "@/lib/calling-countries";
import { validateContact } from "@/lib/contact-validation";
import type { Contact, ContactInput } from "@/lib/contact-types";

export function ContactFormDialog({ contact, onClose, onSaved }: {
  contact:Contact | null; onClose:()=>void; onSaved:(contact:Contact)=>void;
}) {
  const id=useId();
  const [fields,setFields]=useState<ContactInput>(contact ?? {name:"",company:"",phone:"+1",country:"US",notes:""});
  const [dirty,setDirty]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [discard,setDiscard]=useState(false);
  function change<K extends keyof ContactInput>(key:K,value:ContactInput[K]) { setFields((previous)=>({...previous,[key]:value}));setDirty(true);setError(""); }
  function close() { if (!busy) { if (dirty) setDiscard(true); else onClose(); } }
  return <>
    <Dialog open onOpenChange={(open)=>{if (!open) close();}}>
      <DialogContent className="contact-dialog" onInteractOutside={(event)=>event.preventDefault()}>
        <form onSubmit={async(event)=>{
          event.preventDefault();
          if (busy) return;
          const input=validateContact(fields);
          if (!input) { setError("Enter a name and a valid phone number for the selected country.");return; }
          setBusy(true);setError("");
          try {
            const response=await fetch(contact ? `/api/contacts/${contact.id}` : "/api/contacts",{method:contact ? "PUT" : "POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)});
            const data=await response.json();
            if (!response.ok) throw new Error(data.error || "Contact could not be saved.");
            onSaved(data);
          } catch(issue) {setError(issue instanceof Error ? issue.message : "Contact could not be saved.");setBusy(false);}
        }}>
          <DialogHeader><DialogTitle>{contact ? "Edit contact" : "New contact"}</DialogTitle><DialogDescription>Keep the details handy for your next conversation.</DialogDescription></DialogHeader>
          <fieldset disabled={busy} className="contact-form-fields">
            <div className="contact-form-field"><Label htmlFor={`${id}-name`}>Name</Label><Input id={`${id}-name`} autoComplete="name" required maxLength={120} value={fields.name} onChange={(event)=>change("name",event.target.value)}/></div>
            <div className="contact-form-field"><Label htmlFor={`${id}-company`}>Company <span className="contact-optional">optional</span></Label><Input id={`${id}-company`} autoComplete="organization" maxLength={160} value={fields.company} onChange={(event)=>change("company",event.target.value)}/></div>
            <div className="contact-form-field"><Label htmlFor={`${id}-country`}>Country</Label><NativeSelect id={`${id}-country`} className="w-full" value={fields.country} onChange={(event)=>{
              const country=event.target.value as DialingCountry;
              setFields((previous)=>({...previous,country,phone:callingCountries.find((item)=>item.code===country)!.prefix}));setDirty(true);setError("");
            }}>{callingCountries.map((item)=><NativeSelectOption value={item.code} key={item.code}>{item.name} ({item.prefix})</NativeSelectOption>)}</NativeSelect></div>
            <div className="contact-form-field"><Label htmlFor={`${id}-phone`}>Phone number</Label><Input id={`${id}-phone`} type="tel" autoComplete="tel" required maxLength={30} value={fields.phone} onChange={(event)=>change("phone",event.target.value)} aria-describedby={`${id}-phone-hint`}/><p id={`${id}-phone-hint`}>Enter a local or international number for the selected country.</p></div>
            <div className="contact-form-field"><Label htmlFor={`${id}-notes`}>Notes <span className="contact-optional">optional</span></Label><Textarea id={`${id}-notes`} rows={4} maxLength={5000} value={fields.notes} onChange={(event)=>change("notes",event.target.value)} placeholder="Context to remember before you call"/></div>
          </fieldset>
          {error && <p role="alert" className="contact-form-error">{error}</p>}
          <DialogFooter><Button variant="outline" type="button" disabled={busy} onClick={close}>Cancel</Button><Button type="submit" disabled={busy || (contact !== null && !dirty)}>{busy ? "Saving…" : contact ? "Save changes" : "Save contact"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <AlertDialog open={discard} onOpenChange={setDiscard}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Discard contact changes?</AlertDialogTitle><AlertDialogDescription>Your changes have not been saved.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={onClose}>Discard changes</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
