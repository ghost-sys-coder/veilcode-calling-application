"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { CallRecordings } from "@/components/console/call-recordings";
import { callOutcomes, type CallOutcome } from "@/lib/followup-types";
import { localDateTime, localToUtc } from "@/lib/followup-validation";
import { validateWrapUp, type CallWrapUp } from "@/lib/call-wrapup";
import { notifyFollowUpsChanged } from "@/lib/reminder-events";

export function CallWrapUpPanel({callSid,onDirtyChange,onBusyChange}:{callSid:string;onDirtyChange:(dirty:boolean)=>void;onBusyChange:(busy:boolean)=>void}) {
  const id=useId();
  const [record,setRecord]=useState<CallWrapUp | null>(null);
  const [outcome,setOutcome]=useState<CallOutcome>("not_set");
  const [rating,setRating]=useState("");
  const [date,setDate]=useState("");
  const [note,setNote]=useState("");
  const [completed,setCompleted]=useState(false);
  const [dirty,setDirty]=useState(false);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [reload,setReload]=useState(0);
  const [confirmReload,setConfirmReload]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const mounted=useRef(true);
  const saving=useRef(false);
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{
    heading.current?.focus({preventScroll:true});
    heading.current?.scrollIntoView({block:"start",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
  },[]);
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
  useEffect(()=>{onDirtyChange(dirty);},[dirty,onDirtyChange]);
  useEffect(()=>{onBusyChange(busy || loading);},[busy,loading,onBusyChange]);
  useEffect(()=>{
    const controller=new AbortController();
    async function load() {
      try {
        const response=await fetch(`/api/voice/calls/${callSid}/wrapup`,{cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(25000)])});
        const data=await response.json();
        if (!response.ok) throw new Error(data.error || "Call details are unavailable.");
        if (!controller.signal.aborted) {setRecord(data);setOutcome(data.outcome);setRating(data.rating===null ? "" : String(data.rating));setDate(localDateTime(data.callbackAt));setNote(data.note);setCompleted(data.completed);setDirty(false);setError("");}
      } catch(issue) {if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : "Call details are unavailable.");}
      finally {if (!controller.signal.aborted) setLoading(false);}
    }
    void load();return ()=>controller.abort();
  },[callSid,reload]);
  function changed() {setDirty(true);setMessage("");}
  function reloadSaved() {setLoading(true);setMessage("");setConfirmReload(false);setReload(value=>value+1);}
  return <Card className="call-wrapup" role="region" aria-labelledby={`${id}-title`}>
    <CardHeader><div className="terminal-overline">AFTER THE CALL</div><CardTitle><h2 ref={heading} tabIndex={-1} id={`${id}-title`}>How did it go?</h2></CardTitle>
      <CardDescription>{record?.phone ? `Review your call to ${record.phone}. ` : "Review this call. "}Save the outcome, quality rating and next step together.</CardDescription>
    </CardHeader>
    <CardContent>
      {loading && <p role="status">Loading call details…</p>}
      <form onSubmit={async(event)=>{
        event.preventDefault();if (!record || saving.current || loading) return;
        const submittedDate=new FormData(event.currentTarget).get("callbackAt");
        const callbackAt=typeof submittedDate==="string" && submittedDate===localDateTime(record.callbackAt) ? record.callbackAt : typeof submittedDate==="string" ? localToUtc(submittedDate) : null;
        const input=validateWrapUp({outcome,note,rating:rating==="" ? null : Number(rating),callbackAt:outcome==="callback_needed" ? callbackAt : null,
          completed:outcome==="callback_needed" && completed,expectedRating:record.rating,expectedRevision:record.revision});
        if (!input) {setError("Choose a valid callback time and a rating from 1 to 5, or leave the rating unset.");return;}
        saving.current=true;setBusy(true);setError("");setMessage("");
        try {
          const response=await fetch(`/api/voice/calls/${callSid}/wrapup`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(input),signal:AbortSignal.timeout(45000)});
          const data=await response.json();
          if (!response.ok) throw new Error(data.error || "Call details were not saved.");
          if (!mounted.current) return;
          setRecord(data);setNote(data.note);setDirty(false);onDirtyChange(false);setMessage("Call review saved. Any open callback is now in Follow-ups.");notifyFollowUpsChanged();
        } catch(issue) {if (mounted.current) setError(issue instanceof Error ? issue.message : "Call details were not saved. Your draft is still here.");}
        finally {saving.current=false;if (mounted.current) setBusy(false);}
      }}>
        <fieldset className="followup-fields" disabled={loading || busy || !record}>
          <div className="wrapup-field-row"><div><Label htmlFor={`${id}-outcome`}>Call outcome</Label><Select disabled={loading || busy || !record} value={outcome} onValueChange={value=>{setOutcome(value as CallOutcome);setCompleted(false);changed();}}>
            <SelectTrigger id={`${id}-outcome`}><SelectValue/></SelectTrigger><SelectContent>{callOutcomes.map(item=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select></div><div><Label htmlFor={`${id}-rating`}>Audio quality</Label><Select disabled={loading || busy || !record} value={rating || "unrated"} onValueChange={value=>{setRating(value==="unrated" ? "" : value);changed();}}>
            <SelectTrigger id={`${id}-rating`}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="unrated">Not rated</SelectItem>{[1,2,3,4,5].map(value=><SelectItem key={value} value={String(value)}>{value} / 5{value===1 ? " · Poor" : value===5 ? " · Excellent" : ""}</SelectItem>)}</SelectContent>
          </Select></div></div>
          {outcome==="callback_needed" && <><div><Label htmlFor={`${id}-date`}>Callback date and time</Label><Input id={`${id}-date`} name="callbackAt" type="datetime-local" required min="2000-01-01T00:00" max="2100-12-31T23:59" value={date} onChange={event=>{setDate(event.target.value);setCompleted(false);changed();}}/><p className="followup-hint">Your local time ({Intl.DateTimeFormat().resolvedOptions().timeZone}). Email reminders follow your preferences in the reminder inbox.</p></div>
            <div><Label htmlFor={`${id}-completed`}>Follow-up status</Label><Select disabled={loading || busy || !record} value={completed ? "completed" : "open"} onValueChange={value=>{setCompleted(value==="completed");changed();}}><SelectTrigger id={`${id}-completed`}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="open">Open</SelectItem><SelectItem value="completed">Completed</SelectItem></SelectContent></Select></div></>}
          <div><Label htmlFor={`${id}-note`}>Outcome / callback note</Label><Textarea id={`${id}-note`} rows={3} maxLength={5000} value={note} onChange={event=>{setNote(event.target.value);changed();}} placeholder="What happened, and what should you discuss next?"/></div>
          <Button type="submit" disabled={!dirty || busy}>{busy ? "Saving…" : "Save call review"}</Button>
        </fieldset>
      </form>
      {error && <p className="review-message" role="alert">{error}</p>}
      <p className="review-feedback" role="status" aria-live="polite">{message || (dirty ? "Unsaved changes" : "")}</p>
      <div className="wrapup-links"><Button type="button" variant="outline" size="sm" disabled={loading || busy} onClick={()=>dirty ? setConfirmReload(true) : reloadSaved()}>Reload saved details</Button>
        <Button asChild type="button" variant="ghost" size="sm" disabled={busy}><Link href={`/console/history?call=${callSid}`} onClick={event=>{if (busy || dirty) {event.preventDefault();setError("Save your draft before opening the full review.");}}}>Open full review</Link></Button></div>
      {record && <CallRecordings callSid={callSid}/>}
      <AlertDialog open={confirmReload} onOpenChange={setConfirmReload}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Reload saved details?</AlertDialogTitle><AlertDialogDescription>This replaces your unsaved draft with the latest saved outcome, rating and callback.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><Button type="button" onClick={reloadSaved}>Reload details</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </CardContent>
  </Card>;
}
