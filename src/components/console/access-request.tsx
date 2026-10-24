"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { OperatorAccess } from "@/lib/billing-types";

export function AccessRequest({profileReady,onApproved}:{profileReady:boolean;onApproved?:()=>void}) {
  const [access,setAccess]=useState<OperatorAccess|null>(null),[legacy,setLegacy]=useState(false),[loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const load=useCallback(async(signal?:AbortSignal)=>{
    const response=await fetch("/api/access",{cache:"no-store",signal}),data=await response.json();
    if(!response.ok)throw new Error(data.error || "Access status could not be loaded.");
    if(!signal?.aborted){setAccess(data.access);setLegacy(data.legacy);setError("");if(data.access?.status==="approved")onApproved?.();}
  },[onApproved]);
  useEffect(()=>{const controller=new AbortController();async function initialize(){try{await load(controller.signal);}catch(error){if(!controller.signal.aborted)setError((error as Error).message);}finally{if(!controller.signal.aborted)setLoading(false);}}void initialize();return()=>controller.abort();},[load]);
  async function submit(){setBusy(true);try{const response=await fetch("/api/access",{method:"POST"}),data=await response.json();if(!response.ok)throw new Error(data.error);await load();}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
  if(legacy)return null;
  const labels={pending:"Your access request is awaiting review",approved:"Your account is approved",rejected:"Your request needs changes",suspended:"Your account access is paused"};
  return <Alert className="billing-access-request"><AlertTitle>{loading ? "Checking account access…" : access ? labels[access.status] : "Request access to VeilCall"}</AlertTitle><AlertDescription>
    <p>{access?.status==="approved" ? "Your workspace is available. Paid calling will open after the pilot's billing and number setup are ready." : "Account access and number approval are reviewed separately by the application owner."}</p>
    {access?.reviewNote && <p>{access.reviewNote}</p>}{error && <p role="alert">{error}</p>}
    {!loading && (!access || access.status==="rejected") && <Button type="button" disabled={!profileReady || busy} onClick={()=>void submit()}>{busy ? "Submitting…" : "Request account access"}</Button>}
    {!profileReady && !access && <p>Save your business details first.</p>}
    {access?.status==="approved" && <Button asChild variant="outline"><Link href="/console/billing">Open your workspace</Link></Button>}
    <Button type="button" variant="ghost" disabled={loading || busy} onClick={()=>void load().catch(error=>setError((error as Error).message))}>Refresh access status</Button>
  </AlertDescription></Alert>;
}
