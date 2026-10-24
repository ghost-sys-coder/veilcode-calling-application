"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CalendarClock, Check, Clock, Phone } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SidebarMenuBadge } from "@/components/ui/sidebar";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { localDateTime, localToUtc } from "@/lib/followup-validation";
import { followUpsChanged, notifyFollowUpsChanged } from "@/lib/reminder-events";
import type { CallbackReminder, ReminderAction, ReminderSummary } from "@/lib/reminder-types";

const ReminderContext=createContext<{data:ReminderSummary | null;error:string;refresh:()=>void;busy:boolean;open:boolean;setOpen:(value:boolean)=>void;act:(item:CallbackReminder,input:ReminderAction)=>Promise<boolean>} | null>(null);
function useReminders() {const context=useContext(ReminderContext);if (!context) throw new Error("Reminder provider is missing.");return context;}

export function CallbackReminderProvider({children}:{children:React.ReactNode}) {
  const [data,setData]=useState<ReminderSummary | null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [open,setOpen]=useState(false);
  const actionInFlight=useRef(false);
  const request=useRef<AbortController | null>(null);
  const refresh=useCallback(()=>{
    request.current?.abort();const controller=new AbortController();request.current=controller;
    const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
    void (async()=>{
      try {
        const response=await fetch(`/api/voice/reminders?timezone=${encodeURIComponent(timezone)}`,{cache:"no-store",signal:controller.signal});
        const value=await response.json();if (!response.ok) throw new Error(value.error || "Reminders unavailable.");
        if (!controller.signal.aborted) {setData(value);setError("");}
      } catch(issue) {if (!controller.signal.aborted) {setData(null);setError(issue instanceof Error ? issue.message : "Reminders unavailable.");}}
    })();
  },[]);
  useEffect(()=>{
    refresh();
    const visibleRefresh=()=>{if(document.visibilityState==="visible")refresh();};
    const otherTab=(event:StorageEvent)=>{if(event.key===followUpsChanged)visibleRefresh();};
    const timer=setInterval(visibleRefresh,60000);
    window.addEventListener("focus",visibleRefresh);document.addEventListener("visibilitychange",visibleRefresh);
    window.addEventListener(followUpsChanged,refresh);window.addEventListener("storage",otherTab);
    return ()=>{clearInterval(timer);request.current?.abort();window.removeEventListener("focus",visibleRefresh);document.removeEventListener("visibilitychange",visibleRefresh);window.removeEventListener(followUpsChanged,refresh);window.removeEventListener("storage",otherTab);};
  },[refresh]);
  const act=async(item:CallbackReminder,input:ReminderAction)=>{
    if (actionInFlight.current) return false;
    actionInFlight.current=true;setBusy(true);
    try {
      const response=await fetch(`/api/voice/reminders/${item.callSid}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)});
      const value=await response.json();if (!response.ok) throw new Error(value.error || "The callback was not updated.");
      notifyFollowUpsChanged();return true;
    } catch(issue) {
      // Remove stale actions after an uncertain response; an explicit refresh
      // retrieves the database state before the operator can try again.
      request.current?.abort();setData(null);setError(issue instanceof Error ? issue.message : "The callback update could not be confirmed. Refresh reminders.");return false;
    } finally {actionInFlight.current=false;setBusy(false);}
  };
  return <ReminderContext.Provider value={{data,error,refresh,busy,open,setOpen,act}}>{children}</ReminderContext.Provider>;
}

export function CallbackSidebarCount() {
  const {data}=useReminders();
  if (!data?.attentionCount) return null;
  return <SidebarMenuBadge className="rounded bg-secondary" aria-label={`${data.attentionCount} callbacks due today or overdue`}>{data.attentionCount>99 ? "99+" : data.attentionCount}</SidebarMenuBadge>;
}

export function CallbackReminders() {
  const {data,error,refresh,busy,act,open,setOpen}=useReminders();
  const [editor,setEditor]=useState<CallbackReminder | null>(null);
  const [date,setDate]=useState("");
  const [dateError,setDateError]=useState("");
  const [message,setMessage]=useState("");
  const pending=data?.pendingCount ?? 0;
  async function action(item:CallbackReminder,input:ReminderAction,feedback:string) {setMessage("");if(await act(item,input)){setMessage(feedback);return true;}return false;}
  return <>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild><Button variant="ghost" size="sm" className="reminder-trigger" aria-label={`Callback reminders${pending ? `, ${pending} due` : error ? ", unavailable" : ""}`}><Bell aria-hidden="true"/><span className="reminder-trigger-label">Reminders</span>{pending>0 && <span className="reminder-count">{pending>99 ? "99+" : pending}</span>}{error && <span aria-hidden="true">!</span>}</Button></SheetTrigger>
      <SheetContent className="reminder-sheet w-full sm:max-w-lg" onOpenAutoFocus={()=>setMessage("")}>
        <SheetHeader><SheetTitle>Callback reminders</SheetTitle><SheetDescription>Today and anything overdue. Alerts appear while VeilCall is open or when you return.</SheetDescription></SheetHeader>
        <div className="reminder-body">
          <div className="reminder-toolbar"><p>{data ? `${data.attentionCount} open · ${pending} new due` : error ? "Reminders unavailable" : "Loading reminders…"}</p><Button variant="ghost" size="sm" disabled={busy} onClick={refresh}>Refresh</Button></div>
          {error && <Alert variant="destructive"><AlertTitle>Check your reminders</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          <p className="reminder-feedback" role="status">{message}</p>
          {data && data.items.length===0 && <div className="reminder-empty"><CalendarClock aria-hidden="true"/><h3>You’re clear for today.</h3><p>Schedule a callback from a call’s outcome in call history.</p></div>}
          <ul className="reminder-list">{data?.items.map((item)=>{
            const due=Date.parse(item.callbackAt)<=Date.parse(data.generatedAt);
            return <li key={`${item.callSid}:${item.revision}`}><div className="reminder-item-heading"><strong>{item.name || item.phone}</strong><span className={due ? "followup-overdue" : ""}>{due ? item.acknowledged ? "Due · alert dismissed" : "Due" : "Later today"}</span></div>
              {item.name && <p>{item.phone}</p>}<time dateTime={item.callbackAt}>{new Date(item.callbackAt).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short",timeZone:data.timezone})}</time>
              {item.note && <p className="reminder-note">{item.note}</p>}
              <div className="reminder-actions"><Button asChild size="sm" variant="outline"><Link href={`/console?callback=${item.callSid}`} onClick={()=>setOpen(false)}><Phone aria-hidden="true"/> Open dialer</Link></Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={()=>void action(item,{action:"complete",revision:item.revision},"Callback completed.")}><Check aria-hidden="true"/> Complete</Button>
                {due && <Button size="sm" variant="ghost" disabled={busy} onClick={()=>void action(item,{action:"snooze",revision:item.revision,minutes:15},"Callback moved to 15 minutes from now.")}><Clock aria-hidden="true"/> Snooze 15 min</Button>}
                <Button size="sm" variant="ghost" disabled={busy} onClick={()=>{setDate(localDateTime(new Date(Math.max(Date.parse(item.callbackAt),Date.now()+3600000)).toISOString()));setDateError("");setEditor(item);}}>Reschedule</Button>
                {due && !item.acknowledged && <Button size="sm" variant="ghost" disabled={busy} onClick={()=>void action(item,{action:"acknowledge",revision:item.revision},"Alert dismissed. The callback stays open.")}>Dismiss alert</Button>}
              </div>
            </li>;
          })}</ul>
          {data && data.attentionCount>data.items.length && <p className="reminder-hint">Showing {data.items.length} of {data.attentionCount}. New due alerts appear first. View all follow-ups for the full queue.</p>}
          <p className="reminder-hint">Times use {data?.timezone || "your browser’s timezone"}. Snoozing changes the callback time. Dismissing an alert keeps the callback open. Opening the dialer requires you to start the call.</p>
          <Button asChild variant="outline"><Link href="/console/followups" onClick={()=>setOpen(false)}>View all follow-ups</Link></Button>
        </div>
      </SheetContent>
    </Sheet>
    <Dialog open={!!editor} onOpenChange={(value)=>{if (!value && !busy)setEditor(null);}}><DialogContent onInteractOutside={(event)=>event.preventDefault()}><DialogHeader><DialogTitle>Reschedule callback</DialogTitle><DialogDescription>{editor?.name || editor?.phone} · Choose a future time in your browser’s timezone.</DialogDescription></DialogHeader>
      <form className="reminder-reschedule" onSubmit={async(event)=>{
        event.preventDefault();if(!editor || busy)return;
        const value=new FormData(event.currentTarget).get("callbackAt");const callbackAt=typeof value==="string" ? localToUtc(value) : null;
        if(!callbackAt || Date.parse(callbackAt)<=Date.now()){setDateError("Choose a valid future date and time.");return;}
        if(await action(editor,{action:"reschedule",revision:editor.revision,callbackAt},"Callback rescheduled."))setEditor(null);
      }}><Label htmlFor="reminder-callback-at">Callback date and time</Label><Input id="reminder-callback-at" name="callbackAt" type="datetime-local" required max="2100-12-31T23:59" disabled={busy} value={date} onChange={(event)=>{setDate(event.target.value);setDateError("");}}/>
        {(dateError || error) && <p role="alert" className="text-sm text-destructive">{dateError || error}</p>}
        <div className="reminder-actions"><Button type="submit" disabled={busy || !!error}>{busy ? "Saving…" : "Save new time"}</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>setEditor(null)}>Cancel</Button></div>
      </form>
    </DialogContent></Dialog>
  </>;
}

export function CallbackReminderNotice() {
  const {data,error,setOpen}=useReminders();
  // Keep a mounted live region. A count change is announced without taking
  // focus from a call, a recording, or an unsaved form.
  return <div className="reminder-notice" role="status" aria-live="polite" aria-atomic="true">
    {error ? <p className="reminder-hint">Callback reminders are unavailable. <Button variant="link" size="sm" onClick={()=>setOpen(true)}>Open reminders</Button> to refresh.</p> : !!data?.pendingCount && <Alert role="presentation"><Bell aria-hidden="true"/><AlertTitle>{data.pendingCount} callback{data.pendingCount===1 ? " is" : "s are"} due</AlertTitle><AlertDescription>Call back, snooze, or dismiss the alert.<Button variant="outline" size="sm" className="mt-2" onClick={()=>setOpen(true)}>Review callbacks</Button></AlertDescription></Alert>}
  </div>;
}
