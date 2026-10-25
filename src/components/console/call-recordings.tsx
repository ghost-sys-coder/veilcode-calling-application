"use client";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RecordingPlayer } from "@/components/console/recording-player";
import type { CallReview } from "@/lib/review-types";

export function CallRecordings({callSid}:{callSid:string}) {
  const [record,setRecord]=useState<CallReview | null>(null);
  const [error,setError]=useState("");
  const [refresh,setRefresh]=useState(0);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    const controller=new AbortController();
    let timer:ReturnType<typeof setTimeout>;
    let attempts=0;
    async function load() {
      try {
        const response=await fetch(`/api/voice/reviews/${callSid}`,{cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(25000)])});
        const data:CallReview & {error?:string}=await response.json();
        if (!response.ok) throw new Error(data.error || "Recording status is unavailable.");
        if (controller.signal.aborted) return;
        setRecord(data);setError("");
        const pending=!data.recordings.length || data.recordings.some(item=>!["completed","absent","deleted"].includes(item.status));
        if (pending && ++attempts<12) timer=setTimeout(()=>void load(),5000);
      } catch(issue) {if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : "Recordings are unavailable.");}
      finally {if (!controller.signal.aborted) setLoading(false);}
    }
    void load();
    return ()=>{controller.abort();clearTimeout(timer);};
  },[callSid,refresh]);
  return <section className="wrapup-recordings" aria-label="Recordings from this call">
    <div className="review-section-title"><h3>Recording &amp; playback</h3><Button type="button" variant="ghost" size="sm" disabled={loading} onClick={()=>{setLoading(true);setRefresh(value=>value+1);}}><RefreshCw size={14}/> Refresh</Button></div>
    {loading && !record && <div className="grid gap-3" role="status" aria-label="Checking recordings"><Skeleton className="h-16 w-full rounded-lg"/><Skeleton className="h-3 w-44 max-w-full"/></div>}
    {error && <p role="alert" className="review-message">{error}</p>}
    {record?.recordings.map(recording=><RecordingPlayer key={recording.sid} recording={recording} bookmarks={record.bookmarks.filter(item=>item.recordingSid===recording.sid)}/>)}
    {!loading && record && !record.recordings.length && <p className="followup-hint">No recording is available yet. If you started recording, audio may still be processing; refresh shortly. For your next call, confirm participant consent and select Start recording after they answer.</p>}
  </section>;
}
