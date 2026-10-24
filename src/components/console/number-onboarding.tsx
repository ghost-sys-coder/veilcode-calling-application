"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Phone, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BusinessProfileForm } from "@/components/console/business-profile-form";
import { NumberRequestForm } from "@/components/console/number-request-form";
import { NumberRequestCard } from "@/components/console/number-request-card";
import type { NumberSetupSummary } from "@/lib/number-types";

export function NumberOnboarding() {
  const [summary,setSummary]=useState<NumberSetupSummary|null>(null);const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);
  const load=useCallback(async(signal?:AbortSignal)=>{
    const response=await fetch("/api/onboarding",{cache:"no-store",signal});const data=await response.json();
    if(!response.ok)throw new Error(data.error || "Your number setup could not be loaded.");
    if(!signal?.aborted){setSummary(data);setError("");}
  },[]);
  useEffect(()=>{
    const controller=new AbortController();
    async function initialize(){try{await load(controller.signal);}catch(error){if(!controller.signal.aborted)setError((error as Error).message);}finally{if(!controller.signal.aborted)setLoading(false);}}
    void initialize();return()=>controller.abort();
  },[load]);
  const pendingVerification=Boolean(summary?.requests.some(item=>item.status==="verifying" && item.verification));
  useEffect(()=>{if(!pendingVerification)return;const timer=window.setInterval(()=>{void load().catch(error=>setError((error as Error).message));},5000);return()=>window.clearInterval(timer);},[load,pendingVerification]);
  function refresh(){void load().catch(error=>setError((error as Error).message));}
  async function save(path:string,method:string,body:unknown,notice:string) {
    setBusy(true);setMessage("");
    try {
      const response=await fetch(path,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const data=await response.json();if(!response.ok)throw new Error(data.error || "The change could not be saved.");
      await load();setMessage(notice);
    } finally {setBusy(false);}
  }
  return <main className="shell number-setup-page">
    <div className="number-page-heading"><div><p className="dialer-eyebrow">YOUR BUSINESS / YOUR CALLING IDENTITY</p><h1>A number <em>of your own.</em></h1><p>Set up your business details, then bring an existing number or request a new one.</p></div>
      {summary?.operatorApproved && <Button asChild variant="outline"><Link href="/console">Open dialer<ArrowRight aria-hidden="true"/></Link></Button>}
    </div>
    {loading && <p className="number-loading" role="status">Loading your number setup…</p>}
    {error && <Alert variant="destructive"><AlertTitle>Number setup unavailable</AlertTitle><AlertDescription>{error}<Button variant="outline" type="button" onClick={refresh}><RefreshCw aria-hidden="true"/>Try again</Button></AlertDescription></Alert>}
    {summary && <>
      {!summary.operatorApproved && <Alert className="number-access-notice"><ShieldCheck aria-hidden="true"/><AlertTitle>Calling access is under review</AlertTitle><AlertDescription>You can submit your details and follow your number request here. Business approval, number verification and calling access are reviewed separately.</AlertDescription></Alert>}
      <div className="number-setup-grid">
        <Card><CardHeader><span className="number-step">01 / BUSINESS DETAILS</span><CardTitle>Introduce your business</CardTitle><CardDescription>Tell us who will use the number and what you’ll be calling about.</CardDescription></CardHeader>
          <CardContent><BusinessProfileForm key={JSON.stringify(summary.profile)} profile={summary.profile} busy={busy} onSave={input=>save("/api/onboarding/profile","PUT",input,"Business details saved.")}/></CardContent></Card>
        <Card><CardHeader><span className="number-step">02 / CALLING NUMBER</span><CardTitle>Choose how to get connected</CardTitle><CardDescription>Every number is reviewed and assigned to your account.</CardDescription></CardHeader>
          <CardContent>{summary.profile ? <NumberRequestForm busy={busy} onSubmit={input=>save("/api/onboarding/numbers","POST",input,"Number request submitted for review.")}/>
            : <div className="number-empty"><Phone aria-hidden="true"/><p>Save your business details to choose your calling number.</p></div>}</CardContent></Card>
      </div>
      <p className="number-feedback" role="status">{message}</p>
      {(summary.legacyCallerIds.length>0 || summary.identities.length>0) && <section className="number-assigned-section" aria-labelledby="assigned-numbers-heading"><h2 id="assigned-numbers-heading">Your calling numbers</h2><div className="number-assigned-list">
        {summary.legacyCallerIds.map(number=><div key={number.number}><Phone aria-hidden="true"/><span><strong>{number.label}</strong><span className="number-main-value">{number.number}</span></span><span className="number-status" data-status="verified">Ready</span></div>)}
        {summary.identities.map(number=><div key={number.number}><Phone aria-hidden="true"/><span><strong>{number.label}</strong><span className="number-main-value">{number.number}</span></span><span className="number-status" data-status={number.status==="active" ? "verified" : "revoked"}>{number.status==="active" ? "Ready" : "Disabled"}</span></div>)}
      </div></section>}
      <section className="number-requests-section" aria-labelledby="number-requests-heading"><div className="number-section-heading"><h2 id="number-requests-heading">Your requests</h2><Button variant="ghost" type="button" disabled={busy} onClick={refresh}><RefreshCw aria-hidden="true"/>Refresh</Button></div>
        {summary.requests.length ? <div className="number-request-list">{summary.requests.map(item=><NumberRequestCard key={item.id} item={item} busy={busy} verificationEnabled={summary.verificationEnabled} onVerify={()=>save(`/api/onboarding/numbers/${item.id}/verify`,"POST",{consent:true},"Verification requested. Answer the call and enter the code shown below.")}/>)}</div>
          : <p className="number-hint">Your number requests will appear here, along with their review and verification progress.</p>}
      </section>
      {summary.admin && <div className="number-admin-link"><ShieldCheck aria-hidden="true"/><div><strong>Number administration</strong><p>Review business details, approve verification and assign provisioned numbers.</p></div><Button asChild variant="outline"><Link href="/console/numbers/review">Review requests<ArrowRight aria-hidden="true"/></Link></Button></div>}
    </>}
  </main>;
}
