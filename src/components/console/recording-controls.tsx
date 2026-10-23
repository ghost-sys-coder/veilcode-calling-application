"use client";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useEffect, useRef, useState } from "react";
import { Circle, Pause, Play, Square, RefreshCw } from "lucide-react";
import type { RecordingControlState } from "@/lib/review-types";

export function RecordingControls({ callSid, enabled }: { callSid:string; enabled:boolean }) {
  const [consent,setConsent] = useState(false);
  const [status,setStatus] = useState<RecordingControlState | null>(null);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("Recording is off. Confirm consent before starting.");
  const mounted = useRef(true);
  const requestBusy = useRef(false);
  const mutation = useRef(0);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    let refreshing = false;
    async function refresh() {
      if (refreshing || requestBusy.current) return;
      refreshing = true;
      const version = mutation.current;
      try {
        const response = await fetch(`/api/voice/recordings?callSid=${encodeURIComponent(callSid)}`,{cache:"no-store",signal:controller.signal});
        const data = await response.json();
        if (mounted.current && version === mutation.current) {
          if (response.ok) setStatus(data);
          else setMessage(data.error || "Recording status is unavailable. Refresh to retry.");
        }
      } catch { /* A manual refresh can retry while the call remains active. */ }
      finally { refreshing = false; }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(),8000);
    return () => { mounted.current = false; controller.abort(); window.clearInterval(timer); };
  },[callSid]);

  async function change(action: "start" | "pause" | "resume" | "stop" | "refresh") {
    if (requestBusy.current) return;
    requestBusy.current = true;
    mutation.current += 1;
    setBusy(true);
    try {
      const response = await fetch(action === "refresh" ? `/api/voice/recordings?callSid=${encodeURIComponent(callSid)}` : "/api/voice/recordings",{
        method:action === "refresh" ? "GET" : "POST",cache:"no-store",
        ...(action !== "refresh" ? {headers:{"Content-Type":"application/json"},body:JSON.stringify({callSid,action,recordingSid:status?.active?.sid,consentConfirmed:consent})} : {}),
      });
      const data = await response.json();
      if (!mounted.current) return;
      if (!response.ok) throw new Error(data.error || "Recording change could not be confirmed.");
      setStatus(data);
      setMessage(action === "stop" ? "Recording stopped. It will appear in call history once processed." : action === "pause" ? "Recording paused. No conversation audio is captured while paused." : action === "start" || action === "resume" ? "Recording is on." : "Recording status refreshed.");
    } catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : "Recording is unavailable."); }
    finally { requestBusy.current = false; if (mounted.current) setBusy(false); }
  }
  const active = status?.active;
  const recording = active?.status === "in-progress";
  return <section className="recording-controls" aria-label="Call recording">
    <div className="recording-controls-heading"><strong><Circle size={12} fill={recording ? "currentColor" : "none"}/>{recording ? "RECORDING ON" : active ? "RECORDING PAUSED" : "RECORDING OFF"}</strong>
      <Button variant="ghost" type="button" className="review-icon-button" aria-label="Refresh recording status" onClick={() => void change("refresh")} disabled={busy}><RefreshCw size={15}/></Button></div>
    <Label className="recording-consent" htmlFor={`recording-consent-${callSid}`}><Checkbox id={`recording-consent-${callSid}`} checked={consent} disabled={busy || recording}
      onCheckedChange={(checked) => setConsent(checked === true)}/><span>I informed all participants that this call will be recorded for quality review, and they agreed.</span></Label>
    <div className="recording-buttons">
      {!active ? <Button variant="ghost" type="button" className="review-small-button" disabled={!enabled || !consent || busy || !status} onClick={() => void change("start")}><Circle size={14}/> Start recording</Button>
        : <><Button variant="ghost" type="button" className="review-small-button" disabled={busy || (!recording && (!enabled || !consent))} onClick={() => void change(recording ? "pause" : "resume")}>{recording ? <Pause size={14}/> : <Play size={14}/>} {recording ? "Pause" : "Resume"}</Button>
          <Button variant="ghost" type="button" className="review-small-button" disabled={busy} onClick={() => void change("stop")}><Square size={14}/> Stop</Button></>}
    </div>
    <p role="status" aria-live="polite">{enabled ? message : "New recordings are disabled. You can pause or stop an active recording."}</p>
  </section>;
}
