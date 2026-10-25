"use client";
import {Badge} from '@/components/ui/badge';
import {WorkspaceSkeleton} from '@/components/console/workspace-skeleton';
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Headphones, PhoneOutgoing, RefreshCw } from "lucide-react";
import { CallReviewPanel } from "@/components/console/call-review-panel";
import type { CallReview } from "@/lib/review-types";

export function HistoryWorkspace({ configured,initialCall,initialError }: { configured:boolean;initialCall?:CallReview;initialError?:string }) {
  const [items,setItems] = useState<CallReview[]>(initialCall ? [initialCall] : []);
  const [selected,setSelected] = useState<string | null>(initialCall?.callSid ?? null);
  const [nextCursor,setNextCursor] = useState<string | null>(null);
  const [loading,setLoading] = useState(configured);
  const [syncing,setSyncing] = useState(false);
  const [error,setError] = useState(initialError ?? "");
  const [dirty,setDirty] = useState(false);
  const [pendingCall,setPendingCall] = useState<string | null>(null);
  const load = useCallback(async (cursor?:string,signal?:AbortSignal) => {
    const response = await fetch(`/api/voice/history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,{cache:"no-store",signal});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Call history could not be loaded.");
    if (signal?.aborted) return [];
    setItems((previous) => cursor ? [...previous,...data.items.filter((item:CallReview) => !previous.some((old) => old.callSid === item.callSid))]
      : initialCall && !data.items.some((item:CallReview)=>item.callSid===initialCall.callSid) ? [initialCall,...data.items] : data.items);
    setNextCursor(data.nextCursor);
    setSelected((previous) => previous ?? data.items[0]?.callSid ?? null);
    return data.items as CallReview[];
  },[initialCall]);
  useEffect(() => {
    if (!configured) return;
    const controller = new AbortController();
    async function initialize() {
      try {
        const existing = await load(undefined,controller.signal);
        if (existing.length === 0 && !controller.signal.aborted) {
          setSyncing(true);
          const response = await fetch("/api/voice/history/sync",{method:"POST",signal:controller.signal});
          if (!response.ok) throw new Error("Recent Twilio calls could not be synced. You can retry below.");
          await load(undefined,controller.signal);
        }
      } catch (issue) { if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : "Call history is unavailable."); }
      finally { if (!controller.signal.aborted) { setLoading(false); setSyncing(false); } }
    }
    void initialize();
    return () => controller.abort();
  },[configured,load]);

  const current = items.find((item) => item.callSid === selected);
  return <div className="history-page shell">
    <div className="history-title"><div><p className="dialer-eyebrow"><span className="dialer-blink"/> VEILCALL / REVIEW DESK</p><h1>Call history</h1><p>Listen back, capture the details, and make the next conversation better.</p></div>
      <Button asChild className="vc-button vc-button-primary vc-button-md"><Link href="/console">Open dialer <ArrowUpRight size={16}/></Link></Button></div>
    <div className="history-toolbar"><span><Headphones size={17}/> YOUR CONVERSATIONS</span><Button variant="ghost" type="button" className="review-small-button" disabled={!configured || syncing || loading} onClick={async () => {
      setSyncing(true); setError("");
      try {
        const response = await fetch("/api/voice/history/sync",{method:"POST"});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        await load();
      } catch (issue) { setError(issue instanceof Error ? issue.message : "Sync failed."); }
      finally { setSyncing(false); }
    }}><RefreshCw size={15}/>{syncing ? "Syncing recent calls…" : "Sync recent calls"}</Button></div>
    {error && <p className="review-message" role="alert">{error}</p>}
    {!configured ? <div className="history-empty"><h2>Your review desk is almost ready.</h2><p>Call review storage has not been connected yet. Calling remains available from the dialer.</p></div>
      : loading && items.length === 0 ? <WorkspaceSkeleton variant="detail" label={syncing ? "Bringing in your recent Twilio calls" : "Loading your conversations"}/>
        : items.length === 0 ? <div className="history-empty"><PhoneOutgoing size={30}/><h2>Your next call starts the story.</h2><p>Completed and attempted calls will appear here. Calls made without recording remain in history without audio.</p></div>
          : <div className="history-grid"><aside className="history-list" aria-label="Call history">
            {items.map((call) => <Button variant="ghost" type="button" key={call.callSid} className={`history-call${call.callSid === selected ? " history-call-selected" : ""}`}
              aria-pressed={call.callSid === selected} onClick={() => {
                if (call.callSid === selected) return;
                if (dirty) { setPendingCall(call.callSid); return; }
                setDirty(false); setSelected(call.callSid);
              }}><span className="history-call-top"><strong>{call.to || "Unknown recipient"}</strong><span>{call.country || "—"}</span></span>
              <span>{new Date(call.startedAt).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"})}</span>
              <span className="history-call-bottom"><Badge className={`review-status review-status-${call.status}`}>{call.status.replaceAll("-"," ")}</Badge><span>{Math.floor(call.duration/60)}:{String(call.duration%60).padStart(2,"0")} {call.recordings.some((recording) => !recording.deletedAt) ? "· Audio" : ""}</span></span>
            </Button>)}
            {nextCursor && <Button variant="ghost" type="button" className="review-small-button history-load-more" disabled={loading} onClick={async () => {
              setLoading(true); setError("");
              try { await load(nextCursor); } catch { setError("More calls could not be loaded."); } finally { setLoading(false); }
            }}>{loading ? "Loading…" : "Load more calls"}</Button>}
          </aside>{current && <CallReviewPanel key={current.callSid} call={current} onDirtyChange={setDirty}
            onUpdated={(updated) => setItems((previous) => previous.map((item) => item.callSid === updated.callSid ? updated : item))}/>}</div>}
    <p className="history-footnote">Only your operator account can access these reviews. Dates and times use your browser’s timezone. Recording starts only after you confirm participant consent.</p>
    <AlertDialog open={pendingCall !== null} onOpenChange={(open) => { if (!open) setPendingCall(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Discard unsaved review changes?</AlertDialogTitle>
          <AlertDialogDescription>Your latest edits have not been saved. Stay on this call to save them, or discard them and open the selected call.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => { setDirty(false); setSelected(pendingCall); setPendingCall(null); }}>Discard changes</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
