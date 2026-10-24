"use client";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

import { useEffect, useRef, useState } from "react";
import type { Call, Device as TwilioDevice } from "@twilio/voice-sdk";
import { Mic, MicOff, Phone, PhoneOff, Volume2 } from "lucide-react";
import { CountrySelector } from "@/components/console/country-selector";
import { CallerIdSelector } from "@/components/console/caller-id-selector";
import { RecordingControls } from "@/components/console/recording-controls";
import { CallWrapUpPanel } from "@/components/console/call-wrapup-panel";
import type { CallerIdOption } from "@/lib/caller-id-types";
import { callingCountries, normalizeDialingNumber, type DialingCountry } from "@/lib/calling-countries";
import type { VoiceOutcome } from "@/lib/voice-outcome";
import type { Contact } from "@/lib/contact-types";

type CallState = "idle" | "preparing" | "dialing" | "connected" | "ended" | "error";
const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "0", "⌫"] as const;
const stateLabel: Record<CallState, string> = {
  idle: "READY TO DIAL", preparing: "PREPARING CONNECTION", dialing: "CONNECTING CALL",
  connected: "VOICE SESSION ACTIVE", ended: "CALL FINISHED", error: "CONNECTION ERROR",
};



interface TokenResponse { token?: string; error?: string }
interface AuthorizationResponse { ticket?: string; error?: string }

export function Dialer({ configured, setupIssues, callerIds, recordingEnabled, reviewEnabled, initialContact }: {
  configured: boolean; setupIssues: string[]; callerIds: CallerIdOption[]; recordingEnabled:boolean; reviewEnabled:boolean;
  initialContact?:Pick<Contact,"id"|"name"|"phone"|"country">;
}) {
  const router=useRouter();
  const [callerId, setCallerId] = useState(callerIds[0]?.number ?? "");
  const selectedCaller = callerIds.find((item) => item.number === callerId) ?? callerIds[0];
  const fromNumber = selectedCaller?.number ?? "";
  const [country, setCountry] = useState<DialingCountry>(initialContact?.country ?? "US");
  const selectedCountry = callingCountries.find((item) => item.code === country)!;
  const [phone, setPhone] = useState<string>(initialContact?.phone ?? callingCountries[0].prefix);
  const [callSid, setCallSid] = useState<string | null>(null);
  const [state, setState] = useState<CallState>("idle");
  const [message, setMessage] = useState("Enter the recipient's phone number to begin.");
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [finishedCall,setFinishedCall]=useState<string | null>(null);
  const [wrapUpDirty,setWrapUpDirty]=useState(false);
  const [wrapUpBusy,setWrapUpBusy]=useState(false);
  const [confirmNextCall,setConfirmNextCall]=useState(false);
  const [pendingNavigation,setPendingNavigation]=useState<string | null>(null);
  const sessionSid=useRef<string | null>(null);
  const callRef = useRef<Call | null>(null);
  const deviceRef = useRef<TwilioDevice | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const operationRef = useRef(0);
  const mountedRef = useRef(true);
  const isBusy = state === "preparing" || state === "dialing" || state === "connected";

  useEffect(()=>{
    if (!wrapUpDirty && !wrapUpBusy) return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    const guardLink=(event:MouseEvent)=>{
      if (event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor=event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target!=="_self")) return;
      const target=new URL(anchor.href,window.location.href);
      if (target.origin!==window.location.origin || (target.pathname===window.location.pathname && target.search===window.location.search)) return;
      event.preventDefault();event.stopPropagation();setPendingNavigation(target.pathname+target.search+target.hash);
    };
    window.addEventListener("beforeunload",warn);
    document.addEventListener("click",guardLink,true);
    return ()=>{window.removeEventListener("beforeunload",warn);document.removeEventListener("click",guardLink,true);};
  },[wrapUpDirty,wrapUpBusy]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationRef.current += 1;
      callRef.current?.disconnect();
      deviceRef.current?.destroy();
    };
  }, []);

  useEffect(() => {
    if (state !== "connected") return;
    const interval = window.setInterval(() => {
      if (startedAtRef.current !== null) {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [state]);

  function changeDigit(digit: string) {
    if (isBusy) return;
    if (digit === "⌫") setPhone((previous) => previous.slice(0, -1));
    else if (digit === "+") setPhone((previous) => previous.length ? previous : "+");
    else setPhone((previous) => previous + digit);
  }

  function changeCountry(nextCountry: DialingCountry) {
    if (busyRef.current || country === nextCountry) return;
    const next = callingCountries.find((item) => item.code === nextCountry)!;
    operationRef.current += 1;
    setCountry(nextCountry);
    // Clear the previous recipient to avoid calling it under a different country code.
    setPhone(next.prefix);
    setState("idle");
    setElapsed(0);
    setCallSid(null);
    setMessage(`${next.name} selected. Enter a phone number to begin.`);
  }

  function changeCallerId(number: string) {
    if (busyRef.current || number === fromNumber || !callerIds.some((item) => item.number === number)) return;
    operationRef.current += 1;
    setCallerId(number);
    setState("idle");
    setElapsed(0);
    setCallSid(null);
    setMessage(`Calling as ${callerIds.find((item) => item.number === number)!.label}.`);
  }

  async function refreshOutcome(sid: string, operation: number, unavailableMessage?: string) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (!mountedRef.current || operation !== operationRef.current) return;
      try {
        const response = await fetch(`/api/voice/status?callSid=${encodeURIComponent(sid)}`, {
          credentials: "same-origin", cache: "no-store",
        });
        if (!mountedRef.current || operation !== operationRef.current) return;
        if (response.ok) {
          const outcome = await response.json() as VoiceOutcome;
          if (!mountedRef.current || operation !== operationRef.current) return;
          if (!outcome.pending || attempt === 3) {
            setMessage(outcome.message);
            setState(outcome.failed ? "error" : "ended");
            return;
          }
        } else if (response.status === 401 || response.status === 403 || response.status === 400) {
          break;
        }
      } catch { /* Preserve the SDK result if call logs are temporarily unavailable. */ }
      if (attempt < 3) await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }
    if (unavailableMessage && mountedRef.current && operation === operationRef.current) {
      setMessage(unavailableMessage);
    }
  }

  function finish(messageText: string, readOutcome = true) {
    if (!mountedRef.current) return;
    const sid = callRef.current?.parameters.CallSid ?? sessionSid.current;
    const operation = ++operationRef.current;
    startedAtRef.current = null;
    callRef.current = null;
    deviceRef.current?.destroy();
    deviceRef.current = null;
    busyRef.current = false;
    setMuted(false);
    setMessage(readOutcome && sid ? "Voice session ended. Checking the telephone call outcome..." : messageText);
    setState("ended");
    if (sid) {
      setCallSid(sid);
      if (reviewEnabled) setFinishedCall(sid);
      if (readOutcome) void refreshOutcome(sid, operation, "Voice session ended. Call details are unavailable; check Twilio Call Logs.");
    }
  }

  async function dial(discardDraft=false) {
    if (!configured || busyRef.current || wrapUpBusy) return;
    if (wrapUpDirty && !discardDraft) {setConfirmNextCall(true);return;}
    if (!fromNumber) {
      operationRef.current += 1;
      setState("error");
      setMessage("Select an approved calling number to begin.");
      return;
    }
    const destination = normalizeDialingNumber(phone, country);
    if (!destination) {
      operationRef.current += 1;
      setState("error");
      setMessage(`Enter a valid number for ${selectedCountry.name}, for example ${selectedCountry.example}.`);
      return;
    }
    busyRef.current = true;
    setFinishedCall(null);
    setWrapUpDirty(false);
    setWrapUpBusy(false);
    sessionSid.current=null;
    const operation = ++operationRef.current;
    setMessage("Requesting permission to place the call...");
    setState("preparing");
    setElapsed(0);
    setCallSid(null);
    try {
      // Get browser microphone permission before minting the 45-second dial permit.
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone access requires HTTPS or localhost and a compatible browser.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      if (operation !== operationRef.current) return;
      const authorizationResponse = await fetch("/api/voice/authorize", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: destination, from: fromNumber }),
      });
      const authorization = await authorizationResponse.json() as AuthorizationResponse;
      if (operation !== operationRef.current) return;
      if (!authorizationResponse.ok || !authorization.ticket) {
        throw new Error(authorization.error || "The number was not permitted.");
      }
      const tokenResponse = await fetch("/api/voice/token", { credentials: "same-origin", cache: "no-store" });
      const payload = await tokenResponse.json() as TokenResponse;
      if (operation !== operationRef.current) return;
      if (!tokenResponse.ok || !payload.token) {
        throw new Error(payload.error || "Unable to start your calling session.");
      }
      // Load WebRTC and SIP dependencies only when the operator actually places a call.
      const { Device } = await import("@twilio/voice-sdk");
      if (operation !== operationRef.current) return;
      const device = new Device(payload.token, { closeProtection: true, enableImprovedSignalingErrorPrecision: true });
      deviceRef.current = device;
      device.on("error", (error) => {
        if (!mountedRef.current || operation !== operationRef.current) return;
        operationRef.current += 1;
        const sid = callRef.current?.parameters.CallSid ?? sessionSid.current;
        callRef.current?.disconnect();
        device.destroy();
        callRef.current = null;
        deviceRef.current = null;
        setMessage(`${error.message || "Twilio device error."} (Error ${error.code})`);
        setState("error");
        busyRef.current = false;
        if (sid) {
          setCallSid(sid);
          if (reviewEnabled) setFinishedCall(sid);
          void refreshOutcome(sid, operationRef.current);
        }
      });
      setState("dialing");
      setMessage("Calling through Twilio. Waiting for the recipient...");
      const call = await device.connect({ params: { Ticket: authorization.ticket } });
      if (operation !== operationRef.current) {
        call.disconnect();
        device.destroy();
        return;
      }
      callRef.current = call;
      call.on("accept", () => {
        if (!mountedRef.current || operation !== operationRef.current) return;
        startedAtRef.current = Date.now();
        setElapsed(0);
        setState("connected");
        setMessage("Voice session active. Listen for the recipient to answer.");
        setCallSid(call.parameters.CallSid ?? null);
        sessionSid.current=call.parameters.CallSid ?? null;
      });
      call.on("disconnect", () => {
        if (operation === operationRef.current) finish("The call has ended.");
      });
      call.on("cancel", () => {
        if (operation === operationRef.current) finish("Call cancelled.");
      });
      call.on("reject", () => {
        if (operation === operationRef.current) finish("The call was declined.");
      });
      call.on("error", (error) => {
        if (!mountedRef.current || operation !== operationRef.current) return;
        operationRef.current += 1;
        call.disconnect();
        device.destroy();
        callRef.current = null;
        deviceRef.current = null;
        const sid = call.parameters.CallSid;
        setMessage(`${error.message || "Call failed."} (Error ${error.code})`);
        setState("error");
        busyRef.current = false;
        if (sid) {
          setCallSid(sid);
          if (reviewEnabled) setFinishedCall(sid);
          void refreshOutcome(sid, operationRef.current);
        }
      });
    } catch (error) {
      if (!mountedRef.current || operation !== operationRef.current) return;
      operationRef.current += 1;
      const sid=callRef.current?.parameters.CallSid ?? sessionSid.current;
      callRef.current?.disconnect();
      deviceRef.current?.destroy();
      callRef.current = null;
      deviceRef.current = null;
      busyRef.current = false;
      setState("error");
      setMessage(error instanceof Error ? error.message : "Unable to place the call.");
      if (sid) {setCallSid(sid);if (reviewEnabled) setFinishedCall(sid);}
    }
  }

  function hangUp() {
    operationRef.current += 1;
    const sid = callRef.current?.parameters.CallSid;
    callRef.current?.disconnect();
    deviceRef.current?.disconnectAll();
    // Call disconnect event normally follows; explicitly clear state as a fallback.
    finish("Call ended by operator.", false);
    if (sid) setCallSid(sid);
  }

  function toggleMute() {
    if (!callRef.current || state !== "connected") return;
    callRef.current.mute(!muted);
    setMuted(!muted);
  }

  const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const seconds = String(elapsed % 60).padStart(2, "0");

  return <div className="dialer-column">
    {finishedCall && reviewEnabled && <CallWrapUpPanel key={finishedCall} callSid={finishedCall} onDirtyChange={setWrapUpDirty} onBusyChange={setWrapUpBusy}/>}
    <section className="dialer-terminal" aria-labelledby="dialer-title">
    <div className="terminal-topbar"><span><span className="terminal-light"/> VEILCALL / TERMINAL</span><span>SESSION 001 <span className="terminal-divider">/</span> SECURE</span></div>
    <div className="terminal-body">
      <div className="terminal-heading"><div><div className="terminal-overline">02 / OUTBOUND VOICE</div><h2 id="dialer-title">Make a call<span>.</span></h2></div>
        <span className={`terminal-state terminal-state-${state}`}><span className="terminal-status-dot" />{configured ? stateLabel[state] : "SETUP REQUIRED"}</span>
      </div>
      <CallerIdSelector callerIds={callerIds} value={fromNumber} disabled={!configured || isBusy} onChange={changeCallerId} />
      <CountrySelector country={country} disabled={!configured || isBusy} onChange={changeCountry} />
      {initialContact && phone === initialContact.phone && country === initialContact.country && <p className="dialer-contact-name">Ready to call <strong>{initialContact.name}</strong>. Press Place call when you’re ready.</p>}
      <div className="terminal-number-caption">RECIPIENT PHONE NUMBER <span>{selectedCountry.prefix}</span></div>
      <Label className="terminal-number-field"><Phone size={23} strokeWidth={1.6}/><Input
        type="tel" inputMode="tel" autoComplete="tel" aria-label="Recipient phone number"
        placeholder={selectedCountry.example} value={phone} disabled={!configured || isBusy}
        onChange={(event) => setPhone(event.target.value)} maxLength={30} />
        <span>{country === "GB" ? "UK" : country}</span></Label>
      {!isBusy && <div className="terminal-keypad" aria-label="Phone keypad">
        {digits.map((digit) => <Button variant="ghost" type="button" key={digit} disabled={!configured || isBusy}
          onClick={() => changeDigit(digit)} aria-label={digit === "⌫" ? "Delete last digit" : `Enter ${digit}`}>{digit}</Button>)}
      </div>}
      <div className="terminal-actions">
        {isBusy ? <Button variant="ghost" type="button" className="terminal-end" onClick={hangUp}><PhoneOff size={19}/> End call</Button>
          : <Button variant="ghost" type="button" className="terminal-call" onClick={() => void dial()} disabled={!configured || wrapUpBusy}>
              <Phone size={19}/> Place call <span>→</span>
            </Button>}
        {state === "connected" && <Button variant="ghost" type="button" className="terminal-mute" onClick={toggleMute} aria-label={muted ? "Unmute microphone" : "Mute microphone"}>{muted ? <MicOff size={19}/> : <Mic size={19}/>} {muted ? "Unmute" : "Mute"}</Button>}
      </div>
      <div className="terminal-feedback" role="status" aria-live="polite"><span><Volume2 size={16}/>{configured ? message : "Calling stays disabled until setup is complete."}</span><strong>{minutes}:{seconds}</strong></div>
      {callSid && <div className="terminal-call-reference">CALL REFERENCE <code>{callSid}</code></div>}
      {state === "connected" && callSid && <RecordingControls key={callSid} callSid={callSid} enabled={recordingEnabled}/>}
      {!isBusy && <div className="recording-overview"><strong>{recordingEnabled ? "Call recording available" : "Call recording unavailable"}</strong>
        <p>{recordingEnabled ? "After the recipient answers, confirm their consent and select Start recording. You can pause or stop at any time. Replay saved audio in the after-call review or in Call history." : "Recording must be enabled before you can capture a call. Existing recordings remain in Call history."}</p>
        <Link href="/console/history" onClick={event=>{if (wrapUpDirty || wrapUpBusy) {event.preventDefault();setMessage("Save your call review before opening Call history.");}}}>Open Call history</Link>
      </div>}
      {!configured && <div className="terminal-setup-note"><strong>Setup checklist</strong>
        <p>{setupIssues.length ? `Missing: ${setupIssues.join(", ")}` : "Enable TWILIO_CALLING_ENABLED=true after completing setup."}</p>
      </div>}
    </div>
    <div className="terminal-bottom"><span>ENCRYPTED SIGNALING VIA TWILIO</span><span>MICROPHONE ACCESS REQUIRED</span></div>
  </section>
    <AlertDialog open={confirmNextCall} onOpenChange={setConfirmNextCall}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Start the next call?</AlertDialogTitle><AlertDialogDescription>Your current call review has unsaved changes. Discard them to place the next call, or keep editing and save first.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><Button type="button" disabled={wrapUpBusy} onClick={()=>{setConfirmNextCall(false);void dial(true);}}>Discard and call</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={pendingNavigation!==null} onOpenChange={open=>{if (!open) setPendingNavigation(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{wrapUpBusy ? "Call review is busy" : "Leave this call review?"}</AlertDialogTitle><AlertDialogDescription>{wrapUpBusy ? "Wait for the current request to finish before leaving." : "Your changes have not been saved. Stay here to save them, or discard the draft and leave."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Stay here</AlertDialogCancel><Button type="button" disabled={wrapUpBusy} onClick={()=>{const href=pendingNavigation;setPendingNavigation(null);setWrapUpDirty(false);if (href) router.push(href);}}>Discard and leave</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
