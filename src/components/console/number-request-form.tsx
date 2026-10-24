"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { requestedNumberCountries, validateNumberRequest } from "@/lib/number-validation";
import type { NumberRequestInput } from "@/lib/number-types";

export function NumberRequestForm({busy,onSubmit}:{busy:boolean;onSubmit:(input:NumberRequestInput)=>Promise<void>}) {
  const [kind,setKind]=useState<"existing"|"new">("existing");
  const [label,setLabel]=useState("");const [phone,setPhone]=useState("");const [country,setCountry]=useState("GB");
  const [details,setDetails]=useState("");const [ownership,setOwnership]=useState(false);const [error,setError]=useState("");
  return <form className="number-setup-form" onSubmit={async event=>{
    event.preventDefault();setError("");const input=validateNumberRequest({kind,label,phone,numberCountry:country,details,ownershipConfirmed:ownership});
    if(!input){setError("Enter a label and a valid international phone number, and confirm ownership. For a new number, choose a country.");return;}
    try {await onSubmit(input);setPhone("");setLabel("");setDetails("");setOwnership(false);}catch(error){setError((error as Error).message);}
  }}>
    <div><Label htmlFor="setup-number-option">Choose your number</Label><Select value={kind} onValueChange={value=>{setKind(value as "existing"|"new");setError("");}} disabled={busy}>
      <SelectTrigger id="setup-number-option"><SelectValue/></SelectTrigger><SelectContent>
        <SelectItem value="existing">Use my existing number</SelectItem><SelectItem value="new">Request a new business number</SelectItem>
      </SelectContent></Select></div>
    <p className="number-hint">{kind==="existing" ? "After your request is approved, receive a call and enter the code shown here to prove ownership. Incoming calls stay with your current phone provider." : "We’ll help you find a suitable number, confirm eligibility and documents, and agree the monthly rental before provisioning."}</p>
    <div><Label htmlFor="setup-number-label">Number label</Label><Input id="setup-number-label" required maxLength={60} placeholder="Sales line" value={label} onChange={event=>setLabel(event.target.value)} disabled={busy}/></div>
    {kind==="existing" ? <div><Label htmlFor="setup-existing-phone">Your phone number</Label><Input id="setup-existing-phone" type="tel" autoComplete="tel" required maxLength={40} placeholder="+44 20 7946 0123" value={phone} onChange={event=>setPhone(event.target.value)} disabled={busy}/><p className="number-hint">Include the country code. You must be able to answer a call on this number.</p></div>
      : <div><Label htmlFor="setup-number-country">Number country</Label><Select value={country} onValueChange={setCountry} disabled={busy}>
        <SelectTrigger id="setup-number-country"><SelectValue/></SelectTrigger><SelectContent>{requestedNumberCountries.map(item=><SelectItem key={item.code} value={item.code}>{item.label}</SelectItem>)}</SelectContent>
      </Select><p className="number-hint">Subject to availability and local requirements. Number country and calling destinations are separate choices.</p></div>}
    <div><Label htmlFor="setup-number-details">Anything we should know? <span className="number-optional">(optional)</span></Label><Textarea id="setup-number-details" maxLength={1000} placeholder={kind==="new" ? "Preferred city or area code, and whether you need a local or mobile number." : "For example, whether an extension is needed to reach you."} value={details} onChange={event=>setDetails(event.target.value)} disabled={busy}/><p className="number-hint">Please leave identity documents and payment details out of this field.</p></div>
    {kind==="existing" && <div className="number-consent"><Checkbox id="setup-number-ownership" checked={ownership} onCheckedChange={value=>setOwnership(value===true)} disabled={busy}/><Label htmlFor="setup-number-ownership">I control this number and have permission to use it for business calls.</Label></div>}
    {error && <p className="number-error" role="alert">{error}</p>}
    <Button type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit number request"}</Button>
  </form>;
}
