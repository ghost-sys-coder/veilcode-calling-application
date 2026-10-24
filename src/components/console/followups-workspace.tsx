"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { FollowUpEditor } from "@/components/console/followup-editor";
import type { FollowUpItem, FollowUpPage, FollowUpView } from "@/lib/followup-types";
import { followUpsChanged } from "@/lib/reminder-events";

export function FollowUpsWorkspace({configured}:{configured:boolean}) {
  const [items,setItems]=useState<FollowUpItem[]>([]);
  const [view,setView]=useState<FollowUpView>("open");
  const [cursor,setCursor]=useState<string | null>(null);
  const [loading,setLoading]=useState(configured);
  const [more,setMore]=useState(false);
  const [revision,setRevision]=useState(0);
  const [error,setError]=useState("");
  const [editor,setEditor]=useState<FollowUpItem | null>(null);
  const [dirty,setDirty]=useState(false);
  const [saving,setSaving]=useState(false);
  const [discard,setDiscard]=useState(false);
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60000);return ()=>clearInterval(timer);},[]);
  useEffect(()=>{
    const refresh=()=>setRevision((value)=>value+1);
    const otherTab=(event:StorageEvent)=>{if(event.key===followUpsChanged)refresh();};
    window.addEventListener(followUpsChanged,refresh);window.addEventListener("storage",otherTab);
    return ()=>{window.removeEventListener(followUpsChanged,refresh);window.removeEventListener("storage",otherTab);};
  },[]);
  useEffect(()=>{
    if (!configured) return;
    const controller=new AbortController();
    async function load() {
      try {
        const response=await fetch(`/api/voice/followups?view=${view}`,{cache:"no-store",signal:controller.signal});
        const data=await response.json();if (!response.ok) throw new Error(data.error || "Follow-ups unavailable.");
        if (!controller.signal.aborted) {setItems(data.items);setCursor(data.nextCursor);setNow(Date.now());}
      } catch(issue) {if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : "Follow-ups unavailable.");}
      finally {if (!controller.signal.aborted) setLoading(false);}
    }
    void load();return ()=>controller.abort();
  },[configured,view,revision]);
  function reload(){setLoading(true);setError("");setItems([]);setRevision((value)=>value+1);}
  function close(){if (saving) return;if (dirty) setDiscard(true);else setEditor(null);}
  return <div className="contacts-page followups-page shell">
    <div className="history-title"><div><p className="dialer-eyebrow"><span className="dialer-blink"/> VEILCALL / NEXT CONVERSATIONS</p><h1>Keep the conversation going<span>.</span></h1><p>Your callbacks, in order. Make room for the people who asked to hear from you.</p></div><Button asChild variant="outline"><Link href="/console/history">Open call history</Link></Button></div>
    <div className="followups-toolbar"><div><Label htmlFor="followup-view">Show follow-ups</Label><NativeSelect id="followup-view" disabled={!configured || loading || more} value={view} onChange={(event)=>{setView(event.target.value as FollowUpView);setLoading(true);setItems([]);setError("");}}>
      <NativeSelectOption value="open">All open callbacks</NativeSelectOption><NativeSelectOption value="overdue">Overdue</NativeSelectOption><NativeSelectOption value="upcoming">Upcoming</NativeSelectOption><NativeSelectOption value="completed">Completed</NativeSelectOption>
    </NativeSelect></div><Button variant="ghost" disabled={!configured || loading || more} onClick={reload}>Refresh</Button></div>
    <p className="contacts-feedback" role="status">{loading ? "Loading follow-ups…" : ""}</p>
    {error && <div className="review-message" role="alert">{error}<Button variant="outline" size="sm" disabled={loading || more} onClick={reload}>Retry</Button></div>}
    {!configured ? <div className="history-empty"><h2>Follow-up storage is not connected yet.</h2><p>You can continue calling from the dialer.</p></div>
      : !loading && !error && items.length===0 ? <div className="history-empty"><CalendarClock size={30}/><h2>{view==="completed" ? "No completed callbacks yet." : "No callbacks in this view."}</h2><p>Open a call in call history, choose Callback needed, and save a date and time.</p><Button asChild variant="outline"><Link href="/console/history">Choose a call</Link></Button></div>
      : items.length>0 ? <div className="contacts-directory"><Table><TableHeader><TableRow><TableHead>Contact</TableHead><TableHead>Callback</TableHead><TableHead>Note</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
        <TableBody>{items.map((item)=><TableRow key={item.callSid}><TableCell><div className="contact-person"><strong>{item.name || item.phone}</strong><span>{item.name ? item.phone : item.country}{item.company ? ` · ${item.company}` : ""}</span></div></TableCell>
          <TableCell><div className="contact-number"><time dateTime={item.callbackAt!}>{new Date(item.callbackAt!).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"})}</time><small className={!item.completed && Date.parse(item.callbackAt!)<now ? "followup-overdue" : ""}>{item.completed ? "Completed" : Date.parse(item.callbackAt!)<now ? "Overdue" : "Upcoming"}</small></div></TableCell>
          <TableCell className="contact-notes"><p title={item.note}>{item.note || "—"}</p></TableCell><TableCell><div className="contact-actions"><Button asChild variant="outline" size="sm"><Link href={`/console?callback=${item.callSid}`} aria-label={`Open callback to ${item.name || item.phone} in dialer`}><Phone aria-hidden="true"/> Dial</Link></Button>
            <Button variant="ghost" size="sm" onClick={()=>{setDirty(false);setSaving(false);setEditor(item);}}>Manage</Button></div></TableCell></TableRow>)}</TableBody></Table>
        {cursor && <div className="contacts-more"><Button variant="outline" disabled={loading || more} onClick={async()=>{
          setMore(true);setError("");
          try {const response=await fetch(`/api/voice/followups?view=${view}&cursor=${encodeURIComponent(cursor)}`,{cache:"no-store"});const data=await response.json() as FollowUpPage & {error?:string};if (!response.ok) throw new Error(data.error || "More follow-ups could not be loaded.");setItems((previous)=>[...previous,...data.items.filter((item)=>!previous.some((old)=>old.callSid===item.callSid))]);setCursor(data.nextCursor);}
          catch(issue){setError(issue instanceof Error ? issue.message : "More follow-ups could not be loaded.");}finally{setMore(false);}
        }}>{more ? "Loading…" : "Load more callbacks"}</Button></div>}
      </div> : null}
    <p className="history-footnote">Times use your browser’s timezone. Callbacks are reminders inside VeilCall; opening the dialer never starts a call or completes a follow-up.</p>
    <Dialog open={!!editor} onOpenChange={(open)=>{if (!open) close();}}><DialogContent className="followup-dialog" onInteractOutside={(event)=>event.preventDefault()}><DialogHeader><DialogTitle>Manage callback</DialogTitle><DialogDescription>{editor?.name || editor?.phone} · Reschedule, update the note, or mark it completed.</DialogDescription></DialogHeader>
      {editor && <FollowUpEditor key={editor.callSid} callSid={editor.callSid} initial={editor} onDirtyChange={setDirty} onBusyChange={setSaving} onSaved={()=>{setEditor(null);reload();}}/>}
      <Button variant="outline" disabled={saving} onClick={close}>Close</Button>
    </DialogContent></Dialog>
    <AlertDialog open={discard} onOpenChange={setDiscard}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Discard follow-up changes?</AlertDialogTitle><AlertDialogDescription>Your changes have not been saved.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={()=>{setEditor(null);setDiscard(false);setDirty(false);}}>Discard changes</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
