"use client";
import {Badge} from '@/components/ui/badge';
import { useState } from "react";
import { PhoneCall } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { businessCountries } from "@/lib/number-validation";
import { numberStatusLabels, type NumberRequest } from "@/lib/number-types";

export function NumberRequestCard({item,busy,verificationEnabled,onVerify}:{item:NumberRequest;busy:boolean;verificationEnabled:boolean;onVerify:()=>Promise<void>}) {
  const [open,setOpen]=useState(false);const [consent,setConsent]=useState(false);const [error,setError]=useState("");
  const verification=item.verification;
  const canVerify=item.kind==="existing" && (["approved","failed"].includes(item.status) || (item.status==="verifying" && !verification));
  const country=businessCountries.find(country=>country.code===item.numberCountry)?.label || item.numberCountry;
  return <Card className="number-request-card">
    <CardHeader><div className="number-card-heading"><CardTitle>{item.label}</CardTitle><Badge className="number-status" data-status={item.status}>{numberStatusLabels[item.status]}</Badge></div>
      <p className="number-main-value">{item.phone || `${country} · New number request`}</p></CardHeader>
    <CardContent>
      {item.status==="pending" && <p className="number-hint">We’re reviewing your business details and number choice.</p>}
      {item.status==="approved" && item.kind==="new" && <p className="number-hint">Your request is ready for assisted setup. We’ll confirm availability, documentation and pricing before assigning a number.</p>}
      {["verified","fulfilled"].includes(item.status) && <p className="number-hint">This number is assigned to your account. Calling access is approved separately.</p>}
      {item.status==="failed" && <p className="number-hint">Ownership could not be confirmed on the last call. Check that you can answer this number before trying again.</p>}
      {item.reviewNote && <p className="number-review-note">{item.reviewNote}</p>}
      {verification && <div className="number-verification" role="status">
        <p>When Twilio calls, enter this code on your phone:</p><output aria-label="Phone verification code">{verification.code || "Waiting for code…"}</output>
        <p>The call is in English. This attempt expires at {new Date(verification.expiresAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}. Keep this page open; the result updates automatically.</p>
      </div>}
      {canVerify && <Button type="button" onClick={()=>{setConsent(false);setError("");setOpen(true);}} disabled={busy || !verificationEnabled}><PhoneCall aria-hidden="true"/>Verify this number</Button>}
      {canVerify && !verificationEnabled && <p className="number-hint">Verification calls are temporarily unavailable. Your approved request is saved.</p>}
      <AlertDialog open={open} onOpenChange={setOpen}><AlertDialogContent className="number-verification-dialog"><AlertDialogHeader>
        <AlertDialogTitle>Receive a verification call?</AlertDialogTitle><AlertDialogDescription>Twilio will call {item.phone}. Answer the call and enter the six-digit code shown on this page. This confirms ownership for outgoing caller ID; incoming calls stay with your current provider.</AlertDialogDescription>
      </AlertDialogHeader><div className="number-consent"><Checkbox id={`verify-consent-${item.id}`} checked={consent} onCheckedChange={value=>setConsent(value===true)} disabled={busy}/><Label htmlFor={`verify-consent-${item.id}`}>I control this number and agree to receive this verification call.</Label></div>
        {error && <p className="number-error" role="alert">{error}</p>}
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><Button type="button" disabled={!consent || busy} onClick={async()=>{
          setError("");try{await onVerify();setOpen(false);}catch(error){setError((error as Error).message);}
        }}>{busy ? "Requesting call…" : "Call me to verify"}</Button></AlertDialogFooter>
      </AlertDialogContent></AlertDialog>
    </CardContent>
  </Card>;
}
