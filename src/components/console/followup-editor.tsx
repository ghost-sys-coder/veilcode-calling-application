"use client";
import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { callOutcomes, type FollowUp, type CallOutcome } from "@/lib/followup-types";
import { localDateTime, localToUtc, validateFollowUp } from "@/lib/followup-validation";
import { notifyFollowUpsChanged } from "@/lib/reminder-events";

export function FollowUpEditor({callSid,initial,onDirtyChange,onBusyChange,onSaved}:{
  callSid:string;initial?:FollowUp;onDirtyChange?:(dirty:boolean)=>void;onBusyChange?:(busy:boolean)=>void;onSaved?:()=>void;
}) {
  const id=useId();
  const [record,setRecord]=useState<FollowUp | null>(initial ?? null);
  const [outcome,setOutcome]=useState<CallOutcome>(initial?.outcome ?? "not_set");
  const [date,setDate]=useState(localDateTime(initial?.callbackAt ?? null));
  const [note,setNote]=useState(initial?.note ?? "");
  const [completed,setCompleted]=useState(initial?.completed ?? false);
  const [loading,setLoading]=useState(!initial);
  const [revision,setRevision]=useState(0);
  const [busy,setBusy]=useState(false);
  const [dirty,setDirty]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  useEffect(()=>{onDirtyChange?.(dirty);},[dirty,onDirtyChange]);
  useEffect(()=>{onBusyChange?.(busy);},[busy,onBusyChange]);
  useEffect(()=>{
    if (initial) return;
    const controller=new AbortController();
    async function load() {
      try {
        const response=await fetch(`/api/voice/followups/${callSid}`,{cache:"no-store",signal:controller.signal});
        const data=await response.json();if (!response.ok) throw new Error(data.error || "Outcome unavailable.");
        if (!controller.signal.aborted) {setRecord(data);setOutcome(data.outcome);setDate(localDateTime(data.callbackAt));setNote(data.note);setCompleted(data.completed);}
      } catch(issue) {if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : "Outcome unavailable.");}
      finally {if (!controller.signal.aborted) setLoading(false);}
    }
    void load();return ()=>controller.abort();
  },[callSid,initial,revision]);
  function changed() {setDirty(true);setError("");setMessage("");}
  return <form className="followup-editor" onSubmit={async(event)=>{
    event.preventDefault();if (busy || !record) return;
    const submittedDate=new FormData(event.currentTarget).get("callbackAt");
    const input=validateFollowUp({outcome,note,completed:outcome==="callback_needed" && completed,callbackAt:outcome==="callback_needed" && typeof submittedDate==="string" ? localToUtc(submittedDate) : null});
    if (!input) {setError("Choose a valid callback date and time. Notes can contain up to 5,000 characters.");return;}
    setBusy(true);setError("");setMessage("");
    try {
      const response=await fetch(`/api/voice/followups/${callSid}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)});
      const data=await response.json();if (!response.ok) throw new Error(data.error || "Outcome was not saved.");
      setDirty(false);onDirtyChange?.(false);setMessage("Outcome and follow-up saved.");notifyFollowUpsChanged();onSaved?.();
    } catch(issue) {setError(issue instanceof Error ? issue.message : "Outcome was not saved.");}
    finally {setBusy(false);}
  }}>
    <div className="review-section-title"><h3>Outcome &amp; follow-up</h3><Link href="/console/followups">View follow-ups</Link></div>
    {loading && <p role="status">Loading call outcome…</p>}
    <fieldset disabled={loading || busy || !record} className="followup-fields">
      <div><Label htmlFor={`${id}-outcome`}>Call outcome</Label><NativeSelect id={`${id}-outcome`} value={outcome} onChange={(event)=>{setOutcome(event.target.value as CallOutcome);setCompleted(false);changed();}}>
        {callOutcomes.map((item)=><NativeSelectOption key={item.value} value={item.value}>{item.label}</NativeSelectOption>)}
      </NativeSelect><p className="followup-hint">Your business outcome is saved separately from Twilio’s call status.</p></div>
      {outcome==="callback_needed" && <>
        <div><Label htmlFor={`${id}-date`}>Callback date and time</Label><Input id={`${id}-date`} name="callbackAt" type="datetime-local" required min="2000-01-01T00:00" max="2100-12-31T23:59" value={date} onChange={(event)=>{setDate(event.target.value);setCompleted(false);changed();}}/><p className="followup-hint">Your local time ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</p></div>
        <div><Label htmlFor={`${id}-state`}>Follow-up status</Label><NativeSelect id={`${id}-state`} value={completed ? "completed" : "open"} onChange={(event)=>{setCompleted(event.target.value==="completed");changed();}}><NativeSelectOption value="open">Open</NativeSelectOption><NativeSelectOption value="completed">Completed</NativeSelectOption></NativeSelect></div>
      </>}
      <div><Label htmlFor={`${id}-note`}>Outcome / callback note</Label><Textarea id={`${id}-note`} maxLength={5000} rows={3} value={note} placeholder="What happened, and what should you discuss next?" onChange={(event)=>{setNote(event.target.value);changed();}}/></div>
      <Button type="submit" disabled={!dirty || busy}>{busy ? "Saving…" : "Save outcome"}</Button>
    </fieldset>
    {error && <div className="review-message" role="alert">{error}{!record && !loading && <Button type="button" variant="outline" size="sm" onClick={()=>{setLoading(true);setError("");setRevision((value)=>value+1);}}>Retry</Button>}</div>}
    <p className="review-feedback" role="status" aria-live="polite">{message}</p>
  </form>;
}
