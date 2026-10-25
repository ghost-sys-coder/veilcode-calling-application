"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { businessCountries, validateBusinessProfile } from "@/lib/number-validation";
import type { BusinessProfile } from "@/lib/number-types";

export function BusinessProfileForm({profile,busy,onSave}:{profile:BusinessProfile|null;busy:boolean;onSave:(input:BusinessProfile)=>Promise<void>}) {
  const [draft,setDraft]=useState<BusinessProfile>(profile ?? {businessName:"",contactName:"",businessCountry:"",website:"",purpose:""});
  const [error,setError]=useState("");
  const field=(key:keyof BusinessProfile,value:string)=>setDraft(current=>({...current,[key]:value}));
  return <form className="number-setup-form" onSubmit={async event=>{
    event.preventDefault();setError("");const input=validateBusinessProfile(draft);
    if(!input){setError("Complete your profile details and add at least 10 characters about your calling purpose. Website addresses must start with https://.");return;}
    try {await onSave(input);}catch(error){setError((error as Error).message);}
  }}>
    <div><Label htmlFor="setup-business-name">Your name or business name</Label><Input id="setup-business-name" autoComplete="organization" required maxLength={160} value={draft.businessName} onChange={event=>field("businessName",event.target.value)} disabled={busy}/></div>
    <div><Label htmlFor="setup-contact-name">Your name</Label><Input id="setup-contact-name" autoComplete="name" required maxLength={120} value={draft.contactName} onChange={event=>field("contactName",event.target.value)} disabled={busy}/></div>
    <div><Label htmlFor="setup-business-country">Country where you are based</Label><Select value={draft.businessCountry} onValueChange={value=>field("businessCountry",value)} disabled={busy}>
      <SelectTrigger id="setup-business-country"><SelectValue placeholder="Choose your country"/></SelectTrigger>
      <SelectContent>{businessCountries.map(item=><SelectItem key={item.code} value={item.code}>{item.label}</SelectItem>)}</SelectContent>
    </Select></div>
    <div><Label htmlFor="setup-website">Website <span className="number-optional">(optional)</span></Label><Input id="setup-website" type="url" autoComplete="url" placeholder="https://yourbusiness.com" maxLength={300} value={draft.website} onChange={event=>field("website",event.target.value)} disabled={busy}/></div>
    <div><Label htmlFor="setup-purpose">What will you use VeilCall for?</Label><Textarea id="setup-purpose" required minLength={10} maxLength={1200} placeholder="For example, following up with customers who requested a quote." value={draft.purpose} onChange={event=>field("purpose",event.target.value)} disabled={busy}/></div>
    {error && <p className="number-error" role="alert">{error}</p>}
    <Button type="submit" disabled={busy}>{busy ? "Saving…" : profile ? "Save profile details" : "Save and continue"}</Button>
  </form>;
}
