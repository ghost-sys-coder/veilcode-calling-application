"use client";
import {Badge} from '@/components/ui/badge';
import {WorkspaceSkeleton} from '@/components/console/workspace-skeleton';
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NumberReviewDialog } from "@/components/console/number-review-dialog";
import { numberStatusLabels, type NumberRequest, type NumberReviewInput } from "@/lib/number-types";

export function NumberAdmin() {
  const [requests,setRequests]=useState<NumberRequest[]>([]);const [status,setStatus]=useState("pending");
  const [loading,setLoading]=useState(true);const [error,setError]=useState("");const [selected,setSelected]=useState<NumberRequest|null>(null);
  const load=useCallback(async(signal?:AbortSignal)=>{
    const response=await fetch(`/api/onboarding/admin?status=${status}`,{cache:"no-store",signal});const data=await response.json();
    if(!response.ok)throw new Error(data.error || "Number requests could not be loaded.");if(signal?.aborted)return;setRequests(data.requests);setError("");
  },[status]);
  useEffect(()=>{
    const controller=new AbortController();
    async function initialize(){try{await load(controller.signal);}catch(error){if(!controller.signal.aborted)setError((error as Error).message);}finally{if(!controller.signal.aborted)setLoading(false);}}
    void initialize();return()=>controller.abort();
  },[load]);
  function refresh(){setLoading(true);void load().catch(error=>setError((error as Error).message)).finally(()=>setLoading(false));}
  async function review(input:NumberReviewInput) {
    if(!selected)return;
    const response=await fetch(`/api/onboarding/admin/${selected.id}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)});
    const data=await response.json();if(!response.ok)throw new Error(data.error || "The review could not be saved.");await load();
  }
  return <main className="shell number-setup-page"><div className="number-page-heading"><div><p className="dialer-eyebrow">OWNER / NUMBER ADMINISTRATION</p><h1>Number requests</h1><p>Review the business, approve ownership checks and assign provisioned numbers.</p></div><Button asChild variant="outline"><Link href="/console/numbers"><ArrowLeft aria-hidden="true"/>Your numbers</Link></Button></div>
    <div className="number-admin-toolbar"><div><Label htmlFor="number-review-filter">Request status</Label><Select value={status} onValueChange={value=>{if(value!==status){setLoading(true);setStatus(value);}}}><SelectTrigger id="number-review-filter"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All requests</SelectItem>{Object.entries(numberStatusLabels).map(([value,label])=><SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><Button type="button" variant="outline" onClick={refresh} disabled={loading}><RefreshCw aria-hidden="true"/>Refresh</Button></div>
    {error && <p className="number-error" role="alert">{error}</p>}
    {loading ? <WorkspaceSkeleton label="Loading number requests"/> : !requests.length ? <p className="number-hint">No requests match this status.</p> : <div className="number-request-list">{requests.map(item=><Card key={item.id} className="number-request-card"><CardHeader><div className="number-card-heading"><CardTitle>{item.business.businessName}</CardTitle><Badge className="number-status" data-status={item.status}>{numberStatusLabels[item.status]}</Badge></div><p>{item.business.contactName} · {item.label}</p><p className="number-main-value">{item.phone || `${item.numberCountry} · New number request`}</p></CardHeader><CardContent><p className="number-hint number-review-note">{item.business.purpose}</p><Button type="button" variant="outline" disabled={["rejected","revoked"].includes(item.status)} onClick={()=>setSelected(item)}>Review request</Button></CardContent></Card>)}</div>}
    <p className="number-hint">Showing up to 50 requests. Pending requests appear first when viewing all statuses.</p>
    {selected && <NumberReviewDialog key={`${selected.id}:${selected.revision}`} item={selected} onClose={()=>setSelected(null)} onSave={review}/>}
  </main>;
}
