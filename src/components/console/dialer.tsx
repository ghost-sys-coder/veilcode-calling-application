"use client";

import { useEffect, useRef, useState } from "react";
import type { Call, Device as TwilioDevice } from "@twilio/voice-sdk";
import { Mic, MicOff, Phone, PhoneOff, Volume2 } from "lucide-react";

type CallState = "idle" | "preparing" | "dialing" | "connected" | "ended" | "error";
const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "0", "⌫"] as const;
const stateLabel: Record<CallState, string> = {
  idle: "READY TO DIAL", preparing: "PREPARING CONNECTION", dialing: "CONNECTING CALL",
  connected: "VOICE SESSION ACTIVE", ended: "CALL FINISHED", error: "CONNECTION ERROR",
};



interface TokenResponse { token?: string; error?: string }
interface AuthorizationResponse { ticket?: string; error?: string }

export function Dialer({ configured, setupIssues }: { configured: boolean; setupIssues: string[] }) {
  const [phone, setPhone] = useState("+44");
  const [state, setState] = useState<CallState>("idle");
  const [message, setMessage] = useState("Enter a US number to begin.");
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const callRef = useRef<Call | null>(null);
  const deviceRef = useRef<TwilioDevice | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const operationRef = useRef(0);
  const mountedRef = useRef(true);
  const isBusy = state === "preparing" || state === "dialing" || state === "connected";

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

  function finish(messageText: string) {
    if (!mountedRef.current) return;
    startedAtRef.current = null;
    callRef.current = null;
    deviceRef.current?.destroy();
    deviceRef.current = null;
    busyRef.current = false;
    setMuted(false);
    setMessage(messageText);
    setState("ended");
  }

  async function dial() {
    if (!configured || busyRef.current) return;
    busyRef.current = true;
    const operation = ++operationRef.current;
    setMessage("Requesting permission to place the call...");
    setState("preparing");
    setElapsed(0);
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
        body: JSON.stringify({ to: phone.trim() }),
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
        callRef.current?.disconnect();
        device.destroy();
        callRef.current = null;
        deviceRef.current = null;
        setMessage(error.message || "Twilio device error.");
        setState("error");
        busyRef.current = false;
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
        setMessage(error.message || "Call failed.");
        setState("error");
        busyRef.current = false;
      });
    } catch (error) {
      if (!mountedRef.current || operation !== operationRef.current) return;
      operationRef.current += 1;
      callRef.current?.disconnect();
      deviceRef.current?.destroy();
      callRef.current = null;
      deviceRef.current = null;
      busyRef.current = false;
      setState("error");
      setMessage(error instanceof Error ? error.message : "Unable to place the call.");
    }
  }

  function hangUp() {
    operationRef.current += 1;
    callRef.current?.disconnect();
    deviceRef.current?.disconnectAll();
    // Call disconnect event normally follows; explicitly clear state as a fallback.
    finish("Call ended by operator.");
  }

  function toggleMute() {
    if (!callRef.current || state !== "connected") return;
    callRef.current.mute(!muted);
    setMuted(!muted);
  }

  const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const seconds = String(elapsed % 60).padStart(2, "0");

  return <section className="dialer-terminal" aria-labelledby="dialer-title">
    <div className="terminal-topbar"><span><span className="terminal-light"/> VEILCALL / TERMINAL</span><span>SESSION 001 <span className="terminal-divider">/</span> SECURE</span></div>
    <div className="terminal-body">
      <div className="terminal-heading"><div><div className="terminal-overline">02 / OUTBOUND VOICE</div><h2 id="dialer-title">Make a call<span>.</span></h2></div>
        <span className={`terminal-state terminal-state-${state}`}><span className="terminal-status-dot" />{configured ? stateLabel[state] : "SETUP REQUIRED"}</span>
      </div>
      <div className="terminal-number-caption">RECIPIENT PHONE NUMBER <span>UNITED STATES (+1)</span></div>
      <label className="terminal-number-field"><Phone size={23} strokeWidth={1.6}/><input
        type="tel" inputMode="tel" autoComplete="tel" aria-label="Recipient phone number"
        placeholder="+12125550123" value={phone} disabled={!configured || isBusy}
        onChange={(event) => setPhone(event.target.value)} maxLength={18} />
        <span>US</span></label>
      <div className="terminal-keypad" aria-label="Phone keypad">
        {digits.map((digit) => <button type="button" key={digit} disabled={!configured || isBusy}
          onClick={() => changeDigit(digit)} aria-label={digit === "⌫" ? "Delete last digit" : `Enter ${digit}`}>{digit}</button>)}
      </div>
      <div className="terminal-actions">
        {isBusy ? <button type="button" className="terminal-end" onClick={hangUp}><PhoneOff size={19}/> End call</button>
          : <button type="button" className="terminal-call" onClick={() => void dial()} disabled={!configured}>
              <Phone size={19}/> Place call <span>→</span>
            </button>}
        {state === "connected" && <button type="button" className="terminal-mute" onClick={toggleMute} aria-label={muted ? "Unmute microphone" : "Mute microphone"}>{muted ? <MicOff size={19}/> : <Mic size={19}/>} {muted ? "Unmute" : "Mute"}</button>}
      </div>
      <div className="terminal-feedback" role="status" aria-live="polite"><span><Volume2 size={16}/>{configured ? message : "Calling stays disabled until setup is complete."}</span><strong>{minutes}:{seconds}</strong></div>
      {!configured && <div className="terminal-setup-note"><strong>Setup checklist</strong>
        <p>{setupIssues.length ? `Missing: ${setupIssues.join(", ")}` : "Enable TWILIO_CALLING_ENABLED=true after completing setup."}</p>
      </div>}
    </div>
    <div className="terminal-bottom"><span>ENCRYPTED SIGNALING VIA TWILIO</span><span>MICROPHONE ACCESS REQUIRED</span></div>
  </section>;
}
