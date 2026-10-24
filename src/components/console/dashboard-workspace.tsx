"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarClock, Headphones, Phone, RefreshCw, Star, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dashboardRanges, type DashboardRange, type OutreachDashboard } from "@/lib/dashboard-types";
import { followUpsChanged } from "@/lib/reminder-events";

export function DashboardWorkspace({configured}:{configured:boolean}) {
  const [range,setRange]=useState<DashboardRange>("today");
  const [data,setData]=useState<OutreachDashboard | null>(null);
  const [loading,setLoading]=useState(configured);
  const [error,setError]=useState("");
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    if (!configured) return;
    const controller=new AbortController();
    async function load() {
      try {
        const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
        const response=await fetch(`/api/dashboard?range=${range}&timezone=${encodeURIComponent(timezone)}`,{cache:"no-store",signal:controller.signal});
        const value=await response.json();if (!response.ok) throw new Error(value.error || "Dashboard unavailable.");
        if (!controller.signal.aborted) {setData(value);setError("");}
      } catch(issue) {if (!controller.signal.aborted) {setData(null);setError(issue instanceof Error ? issue.message : "Dashboard unavailable.");}}
      finally {if (!controller.signal.aborted) setLoading(false);}
    }
    void load();return ()=>controller.abort();
  },[configured,range,revision]);
  useEffect(()=>{
    if (!configured) return;
    const refresh=()=>{if(document.visibilityState==="visible")setRevision((value)=>value+1);};
    const timer=setInterval(refresh,60000);window.addEventListener("focus",refresh);
    const otherTab=(event:StorageEvent)=>{if(event.key===followUpsChanged)refresh();};
    window.addEventListener(followUpsChanged,refresh);window.addEventListener("storage",otherTab);
    return ()=>{clearInterval(timer);window.removeEventListener("focus",refresh);window.removeEventListener(followUpsChanged,refresh);window.removeEventListener("storage",otherTab);};
  },[configured]);
  function reload(){setLoading(true);setError("");setRevision((value)=>value+1);}
  const count=(value:number)=>value.toLocaleString();
  const formatDate=(value:string)=>new Date(value).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short",timeZone:data?.timezone});
  const metrics=data ? [
    {label:"Calls made",value:count(data.calls),detail:`${count(data.connected)} connected`,icon:Phone},
    {label:"Connection rate",value:data.finished ? `${Math.round(data.connected/data.finished*100)}%` : "—",detail:data.finished ? `${count(data.connected)} of ${count(data.finished)} finished calls` : "No finished calls in this period",icon:Headphones},
    {label:"Interested prospects",value:count(data.interested),detail:"Latest classified conversation per number",icon:Users},
    {label:"Callbacks due today",value:count(data.dueToday),detail:`${count(data.overdue)} overdue across all dates`,icon:CalendarClock},
    {label:"Average call quality",value:data.averageRating===null ? "—" : `${data.averageRating.toFixed(1)} / 5`,detail:data.rated ? `${count(data.rated)} rated call${data.rated===1 ? "" : "s"}` : "No quality ratings in this period",icon:Star},
  ] : [];
  return <div className="dashboard-page contacts-page shell">
    <div className="history-title dashboard-title"><div><p className="dialer-eyebrow"><span className="dialer-blink"/> VEILCALL / OUTREACH OVERVIEW</p><h1>A little clarity.<br/>A better next call<span>.</span></h1><p>Your activity, your callbacks, and a clear place to start.</p></div><Button asChild><Link href="/console"><Phone aria-hidden="true"/> Make a call <ArrowUpRight aria-hidden="true"/></Link></Button></div>
    <div className="dashboard-toolbar"><div><Label htmlFor="dashboard-range">Activity period</Label><Select disabled={!configured || loading} value={range} onValueChange={value=>{setRange(value as DashboardRange);setData(null);setLoading(true);setError("");}}>
      <SelectTrigger id="dashboard-range"><SelectValue/></SelectTrigger><SelectContent>{dashboardRanges.map((item)=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
    </Select></div><div className="dashboard-updated"><span>{data ? `Updated ${new Date(data.generatedAt).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit",timeZone:data.timezone})}` : ""}</span><Button variant="ghost" size="sm" onClick={reload} disabled={!configured || loading}><RefreshCw size={15} aria-hidden="true"/>{loading ? "Refreshing…" : "Refresh"}</Button></div></div>
    <p role="status" aria-live="polite" className="sr-only">{loading ? "Loading dashboard." : data ? "Dashboard updated." : ""}</p>
    {!configured && <div className="history-empty"><h2>Your overview is almost ready.</h2><p>Dashboard storage is not connected yet. You can continue calling from the dialer.</p></div>}
    {error && <div className="review-message" role="alert">{error}<Button variant="outline" size="sm" disabled={loading} onClick={reload}>Retry</Button></div>}
    {configured && loading && !data && <div className="dashboard-metrics" aria-label="Loading dashboard metrics">{Array.from({length:5},(_,index)=><Card key={index}><CardContent><Skeleton className="h-4 w-28"/><Skeleton className="mt-5 h-10 w-20"/><Skeleton className="mt-3 h-3 w-full"/></CardContent></Card>)}</div>}
    {data && <>
      <div className="dashboard-metrics">{metrics.map(({label,value,detail,icon:Icon})=><Card className="dashboard-metric" key={label}><CardHeader><CardTitle>{label}</CardTitle><Icon size={16} aria-hidden="true"/></CardHeader><CardContent><strong>{value}</strong><p>{detail}</p></CardContent></Card>)}</div>
      <p className="dashboard-period-note">Activity uses {data.timezone} calendar days. Callback counts always show today and include any overdue callbacks from today.</p>
      <div className="dashboard-panels">
        <Card className="dashboard-panel"><CardHeader><div><p className="dashboard-overline">YOUR NEXT CONVERSATIONS</p><CardTitle>Callbacks needing attention</CardTitle></div><Button asChild variant="ghost" size="sm"><Link href="/console/followups">View all <ArrowUpRight size={15}/></Link></Button></CardHeader><CardContent>
          {data.callbacks.length===0 ? <div className="dashboard-empty"><CalendarClock size={24} aria-hidden="true"/><h3>You’re clear for today.</h3><p>No open callbacks are due today or overdue. Set a callback from a call’s outcome in call history.</p></div>
          : <ul className="dashboard-callbacks">{data.callbacks.map((item)=><li key={item.callSid}><div><strong>{item.name || item.phone}</strong><p>{formatDate(item.callbackAt)} <span className={Date.parse(item.callbackAt)<Date.parse(data.generatedAt) ? "dashboard-overdue" : ""}>{Date.parse(item.callbackAt)<Date.parse(data.generatedAt) ? "· Overdue" : "· Today"}</span></p>{item.note && <p className="dashboard-callback-note" title={item.note}>{item.note}</p>}</div><Button asChild variant="outline" size="sm"><Link href={`/console?callback=${item.callSid}`} aria-label={`Open callback to ${item.name || item.phone} in dialer`}><Phone size={14} aria-hidden="true"/> Dial</Link></Button></li>)}</ul>}
        </CardContent></Card>
        <Card className="dashboard-panel dashboard-shortcuts"><CardHeader><p className="dashboard-overline">PICK UP WHERE YOU LEFT OFF</p><CardTitle>Your workspace</CardTitle></CardHeader><CardContent>
          <Button asChild variant="outline"><Link href="/console/history"><Headphones aria-hidden="true"/><span>Review calls &amp; recordings</span><ArrowUpRight aria-hidden="true"/></Link></Button>
          <Button asChild variant="outline"><Link href="/console/contacts"><Users aria-hidden="true"/><span>Open contacts</span><ArrowUpRight aria-hidden="true"/></Link></Button>
          <Button asChild variant="outline"><Link href="/console/followups"><CalendarClock aria-hidden="true"/><span>Manage follow-ups</span><ArrowUpRight aria-hidden="true"/></Link></Button>
        </CardContent></Card>
      </div>
      <Card className="dashboard-panel dashboard-recent"><CardHeader><div><p className="dashboard-overline">RECENT ACTIVITY</p><CardTitle>Your latest calls</CardTitle></div><Button asChild variant="ghost" size="sm"><Link href="/console/history">Call history <ArrowUpRight size={15}/></Link></Button></CardHeader><CardContent>
        {data.recent.length===0 ? <div className="dashboard-empty"><Phone size={24} aria-hidden="true"/><h3>No calls in this period.</h3><p>Choose a longer activity period or start your next conversation from the dialer.</p></div>
        : <Table><TableHeader><TableRow><TableHead>Contact</TableHead><TableHead>When</TableHead><TableHead>Call status</TableHead><TableHead>Duration</TableHead><TableHead className="text-right">Review</TableHead></TableRow></TableHeader><TableBody>{data.recent.map((call)=><TableRow key={call.callSid}>
          <TableCell><div className="contact-person"><strong>{call.name || call.phone || "Unknown recipient"}</strong><span>{call.name ? call.phone : call.country || "—"}</span></div></TableCell><TableCell><time dateTime={call.startedAt}>{formatDate(call.startedAt)}</time></TableCell><TableCell><span className={`review-status review-status-${call.status}`}>{call.status.replaceAll("-"," ")}</span></TableCell><TableCell>{Math.floor(call.duration/60)}:{String(call.duration%60).padStart(2,"0")}</TableCell><TableCell><Button asChild variant="ghost" size="sm"><Link href={`/console/history?call=${call.callSid}`} aria-label={`Review call to ${call.name || call.phone}`}>{call.hasAudio ? <><Headphones size={14} aria-hidden="true"/> Listen</> : "Review"}<ArrowUpRight size={14} aria-hidden="true"/></Link></Button></TableCell>
        </TableRow>)}</TableBody></Table>}
      </CardContent></Card>
      <p className="history-footnote">Only your operator account’s saved calls, outcomes, callbacks, and ratings appear here. Use Sync recent calls in call history to bring in missing Twilio activity.</p>
    </>}
  </div>;
}
