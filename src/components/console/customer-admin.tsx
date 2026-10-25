"use client";
import {Badge} from '@/components/ui/badge';
import {WorkspaceSkeleton} from '@/components/console/workspace-skeleton';
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle } from "@/components/ui/dialog";
import { Alert,AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import type { AccessCustomer } from "@/lib/billing-types";

const labels:Record<string,string>={pending:"Awaiting review",approved:"Approved",rejected:"Changes requested",suspended:"Suspended"};
export function CustomerAdmin(){
  const [customers,setCustomers]=useState<AccessCustomer[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const [selected,setSelected]=useState<AccessCustomer|null>(null),[action,setAction]=useState("approved"),[note,setNote]=useState(""),[busy,setBusy]=useState(false),[dialogError,setDialogError]=useState("");
  const load=useCallback(async(signal?:AbortSignal)=>{const response=await fetch("/api/access/review",{cache:"no-store",signal}),data=await response.json();if(!response.ok)throw new Error(data.error || "Customers could not be loaded.");if(!signal?.aborted){setCustomers(data.customers);setError("");}},[]);
  useEffect(()=>{const controller=new AbortController();async function initialize(){try{await load(controller.signal);}catch(error){if(!controller.signal.aborted)setError((error as Error).message);}finally{if(!controller.signal.aborted)setLoading(false);}}void initialize();return()=>controller.abort();},[load]);
  function open(customer:AccessCustomer){setSelected(customer);setAction(customer.access.status==="approved" ? "suspended" : "approved");setNote("");setDialogError("");}
  async function save(event:React.FormEvent){event.preventDefault();if(!selected)return;setBusy(true);setDialogError("");try{const response=await fetch("/api/access/review",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({operatorId:selected.operatorId,status:action,revision:selected.access.revision,note})});const data=await response.json();if(!response.ok)throw new Error(data.error || "Review could not be saved.");await load();setSelected(null);}catch(error){setDialogError((error as Error).message);}finally{setBusy(false);}}
  return <main className="shell number-setup-page billing-page"><div className="number-page-heading"><div><p className="dialer-eyebrow">OWNER / CUSTOMER ACCESS</p><h1>Customer access</h1><p>Review each business before opening its workspace. Number approval and payments remain separate.</p></div><Button asChild variant="outline"><Link href="/console/numbers/review">Number requests</Link></Button></div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <div className="billing-toolbar"><p>Latest 100 requests · Pending reviews first</p><Button variant="outline" disabled={loading} onClick={()=>void load().catch(error=>setError((error as Error).message))}>Refresh</Button></div>
    {loading ? <WorkspaceSkeleton label="Loading customers"/> : !customers.length ? <Card><CardContent className="billing-empty">Customer access requests will appear here after a business submits its details and requests access.</CardContent></Card> : <div className="billing-customer-grid">{customers.map(customer=><Card key={customer.operatorId}><CardHeader><div className="number-card-heading"><CardTitle>{customer.businessName}</CardTitle><Badge className="number-status" data-status={customer.access.status==="approved" ? "verified" : customer.access.status==="pending" ? "pending" : "rejected"}>{labels[customer.access.status]}</Badge></div><p>{customer.contactName} · {customer.businessCountry}</p></CardHeader><CardContent><p className="billing-purpose">{customer.purpose}</p>{customer.access.reviewNote && <p className="number-hint">{customer.access.reviewNote}</p>}<Button variant="outline" onClick={()=>open(customer)}>Review account</Button></CardContent></Card>)}</div>}
    <Dialog open={!!selected} onOpenChange={open=>{if(!open && !busy)setSelected(null);}}><DialogContent><DialogHeader><DialogTitle>Review {selected?.businessName}</DialogTitle><DialogDescription>Approval opens this customer’s workspace. Paid calling remains unavailable until live billing is launched. Suspension blocks future workspace and API access.</DialogDescription></DialogHeader>
      <form onSubmit={save} className="billing-form"><div><Label htmlFor="customer-action">Decision</Label><Select value={action} onValueChange={setAction} disabled={busy}><SelectTrigger id="customer-action"><SelectValue/></SelectTrigger><SelectContent>{(selected?.access.status==="approved" ? ["suspended"] : selected?.access.status==="pending" || selected?.access.status==="suspended" ? ["approved","rejected"] : ["approved"]).map(value=><SelectItem key={value} value={value}>{value==="approved" ? "Approve account" : value==="suspended" ? "Suspend account" : "Request changes"}</SelectItem>)}</SelectContent></Select></div>
      <div><Label htmlFor="customer-note">Message to the customer {action==="approved" ? "(optional)" : "(required)"}</Label><Textarea id="customer-note" value={note} maxLength={1200} required={action!=="approved"} disabled={busy} onChange={event=>setNote(event.target.value)}/></div>{dialogError && <p role="alert" className="number-error">{dialogError}</p>}<DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={()=>setSelected(null)}>Cancel</Button><Button type="submit" variant={action==="suspended" ? "destructive" : "default"} disabled={busy}>{busy ? "Saving…" : "Save decision"}</Button></DialogFooter></form>
    </DialogContent></Dialog>
  </main>;
}
