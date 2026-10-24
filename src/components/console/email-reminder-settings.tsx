"use client";
import { useEffect, useId, useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { EmailSettings } from "@/lib/email-reminder-types";

export function EmailReminderSettings() {
  const id=useId();
  const [data,setData]=useState<EmailSettings | null>(null);
  const [enabled,setEnabled]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    void(async()=>{
      try{const response=await fetch("/api/voice/reminders/email/preferences",{cache:"no-store",signal:controller.signal});const value=await response.json();if(!response.ok)throw new Error(value.error || "Email settings unavailable.");if(!controller.signal.aborted){setData(value);setEnabled(value.enabled);setError("");}}
      catch(issue){if(!controller.signal.aborted)setError(issue instanceof Error ? issue.message : "Email settings unavailable.");}
    })();return ()=>controller.abort();
  },[revision]);
  return <section className="email-reminder-settings" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}><Mail size={16} aria-hidden="true"/> Email reminders</h3>
    {data ? <form onSubmit={async(event)=>{
      event.preventDefault();if(busy)return;setBusy(true);setError("");setMessage("");
      try {
        const response=await fetch("/api/voice/reminders/email/preferences",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone})});
        const value=await response.json();if(!response.ok)throw new Error(value.error || "Email settings could not be saved.");setData(value);setEnabled(value.enabled);setMessage(value.enabled ? "Email reminders enabled for future callbacks." : "Email reminders disabled.");
      } catch(issue){setData(null);setError(issue instanceof Error ? issue.message : "Email settings could not be confirmed. Reload before retrying.");}
      finally{setBusy(false);}
    }}>
      <div className="email-reminder-choice"><Checkbox id={`${id}-enabled`} checked={enabled} disabled={busy || (!data.configured && !data.enabled) || (!data.recipient && !data.enabled)} onCheckedChange={(value)=>{setEnabled(value===true);setMessage("");}}/><Label htmlFor={`${id}-enabled`}>Email me when a callback becomes due</Label></div>
      <p className="reminder-hint">{data.recipient ? `Sent to your verified account email: ${data.recipient}.` : "Verify your primary email address in your account to enable email reminders."} New callbacks are checked about every five minutes, including while the app is closed. Scheduled checks can be delayed. Earlier overdue callbacks are not emailed when you enable this.</p>
      {!data.configured && <p className="reminder-hint">Email delivery is not configured yet. You can still use in-app reminders.</p>}
      {data.lastSentAt && <p className="reminder-hint">Last email accepted for delivery: {new Date(data.lastSentAt).toLocaleString()}.</p>}
      {data.lastStatus==="failed" && <p className="reminder-hint text-destructive">The latest email could not be confirmed. Your callback is still available in VeilCall.</p>}
      <Button size="sm" variant="outline" disabled={busy || enabled===data.enabled}>{busy ? "Saving…" : "Save email preference"}</Button>
    </form> : !error && <p className="reminder-hint">Loading email settings…</p>}
    {error && <div><p className="reminder-hint text-destructive" role="alert">{error}</p><Button size="sm" variant="outline" disabled={busy} onClick={()=>{setError("");setRevision(value=>value+1);}}>Reload email settings</Button></div>}
    <p className="reminder-feedback" role="status">{message}</p>
  </section>;
}
