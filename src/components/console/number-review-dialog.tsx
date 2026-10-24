"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { NumberRequest, NumberReviewInput } from "@/lib/number-types";

const labels={approve:"Approve setup",reject:"Request changes",fulfill:"Assign provisioned number",revoke:"Disable number"};
export function NumberReviewDialog({item,onClose,onSave}:{item:NumberRequest;onClose:()=>void;onSave:(input:NumberReviewInput)=>Promise<void>}) {
  const actions:(keyof typeof labels)[]=item.status==="pending" ? ["approve","reject"] : item.status==="approved" && item.kind==="new" ? ["fulfill","reject"]
    : ["verified","fulfilled"].includes(item.status) ? ["revoke"] : ["approved","failed","verifying"].includes(item.status) ? ["reject"] : [];
  const [action,setAction]=useState<keyof typeof labels>(actions[0] ?? "reject");const [note,setNote]=useState("");
  const [phone,setPhone]=useState("");const [confirmed,setConfirmed]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  return <Dialog open onOpenChange={open=>{if(!open && !busy)onClose();}}><DialogContent className="number-review-dialog"><DialogHeader><DialogTitle>Review {item.label}</DialogTitle><DialogDescription>{item.kind==="existing" ? "Review the business and ownership request before allowing a verification call." : "Confirm eligibility, required documents and the agreed rental before assigning an existing Twilio-owned number."}</DialogDescription></DialogHeader>
    <div className="number-review-business"><strong>{item.business.businessName}</strong><p>{item.business.contactName} · {item.business.businessCountry}</p>
      {item.business.website && <p>{item.business.website}</p>}<p className="number-review-note">{item.business.purpose}</p>
      {item.details && <p className="number-review-note">{item.details}</p>}<p className="number-hint">Account reference: <code>{item.operatorId}</code></p><p className="number-main-value">{item.phone || `Requested country: ${item.numberCountry}`}</p>
    </div>
    <form className="number-setup-form" onSubmit={async event=>{
      event.preventDefault();setError("");setBusy(true);
      try {await onSave({action,note,phone:action==="fulfill" ? phone : null,expectedRevision:item.revision,complianceConfirmed:confirmed});onClose();}
      catch(error){setError((error as Error).message);}finally{setBusy(false);}
    }}>
      <div><Label htmlFor="number-review-action">Action</Label><Select value={action} onValueChange={value=>setAction(value as keyof typeof labels)} disabled={busy || !actions.length}><SelectTrigger id="number-review-action"><SelectValue/></SelectTrigger><SelectContent>{actions.map(value=><SelectItem key={value} value={value}>{labels[value]}</SelectItem>)}</SelectContent></Select></div>
      {action==="fulfill" && <><div><Label htmlFor="number-review-phone">Provisioned phone number</Label><Input id="number-review-phone" required type="tel" maxLength={40} value={phone} onChange={event=>setPhone(event.target.value)} placeholder="+44 20 7946 0123" disabled={busy}/><p className="number-hint">Must already belong to this Twilio account, support voice and match the requested country.</p></div>
        <div className="number-consent"><Checkbox id="number-review-compliance" checked={confirmed} onCheckedChange={value=>setConfirmed(value===true)} disabled={busy}/><Label htmlFor="number-review-compliance">I have confirmed the customer’s eligibility, required documents and agreed number rental.</Label></div></>}
      <div><Label htmlFor="number-review-note">Message to the customer{["reject","revoke"].includes(action) ? "" : " (optional)"}</Label><Textarea id="number-review-note" maxLength={1000} required={["reject","revoke"].includes(action)} value={note} onChange={event=>setNote(event.target.value)} disabled={busy}/></div>
      <p className="number-hint">Setup approval and number assignment do not grant calling access or activate a subscription.</p>
      {error && <p className="number-error" role="alert">{error}</p>}
      <DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" variant={action==="revoke" ? "destructive" : "default"} disabled={busy || !actions.length || (action==="fulfill" && !confirmed)}>{busy ? "Saving…" : labels[action]}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
