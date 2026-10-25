'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Card,CardContent,CardDescription,CardHeader,CardTitle} from '@/components/ui/card';
import {Alert,AlertDescription} from '@/components/ui/alert';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {settlementReasons,type SettlementReport,type SettlementReviewItem} from '@/lib/settlement-review-types';
const money=(micro:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(micro/1000000);
export function SettlementReview(){
  const [report,setReport]=useState<SettlementReport|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [selected,setSelected]=useState<SettlementReviewItem|null>(null),[note,setNote]=useState(''),[busy,setBusy]=useState(false);
  const working=useRef(false);
  const version=useRef(0);
  const load=useCallback(async(signal?:AbortSignal)=>{
    const requestVersion=++version.current;
    const response=await fetch('/api/admin/call-settlements',{cache:'no-store',signal}),data=await response.json();
    if(!response.ok)throw new Error(data.error||'Unresolved calls could not be loaded.');
    if(!signal?.aborted&&version.current===requestVersion)setReport(data);
  },[]);
  useEffect(()=>{const controller=new AbortController();void load(controller.signal).catch(error=>{if(!controller.signal.aborted)setError((error as Error).message);});return()=>controller.abort();},[load]);
  async function refresh(){if(working.current)return;working.current=true;setBusy(true);setError('');try{await load();}catch(error){setError((error as Error).message);}finally{working.current=false;setBusy(false);}}
  async function check(recheck=false){
    if(working.current)return;working.current=true;++version.current;setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/admin/call-settlements',{method:'POST',...(recheck&&selected?{headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'recheck',id:selected.id,revision:selected.revision,note:note.trim()})}:{})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Calls could not be checked.');
      setReport(data.status);setSelected(null);setNote('');
      setNotice(data.settled ? `${data.settled} call settlement${data.settled===1?'':'s'} completed. Unused credit has been released.` : recheck ? 'Call rechecked. Credit stays reserved until the final result is verified.' : 'Due calls checked. Unverified credit remains reserved.');
    }catch(error){setError((error as Error).message);await load().catch(()=>{});}finally{working.current=false;setBusy(false);}
  }
  const failedRecently=report?.lastAutomaticFailure && (!report.lastAutomaticCheck||new Date(report.lastAutomaticFailure)>new Date(report.lastAutomaticCheck));
  return <section aria-labelledby="settlement-review-title"><Card>
    <CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle><h2 id="settlement-review-title">Unresolved calls</h2></CardTitle><CardDescription>Review calls whose final charge could not be verified. Their credit stays reserved.</CardDescription></div><Button variant="outline" size="sm" disabled={busy} onClick={()=>void refresh()} aria-label="Refresh unresolved calls"><RefreshCw aria-hidden="true"/>Refresh</Button></div></CardHeader>
    <CardContent className="space-y-4">
      {error&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {!report&&!error&&<p role="status" className="number-hint">Loading unresolved calls…</p>}
      {report&&<>
        {!report.review&&!report.pending&&<p>No unresolved calls.</p>}
        {!!report.pending&&<div className="flex flex-wrap items-center justify-between gap-3"><p>{report.pending} call{report.pending===1?' is':'s are'} awaiting automatic checks.</p><Button size="sm" variant="outline" disabled={busy||!report.due} onClick={()=>void check()}>Check due calls</Button></div>}
        {!!report.review&&<>
          <p className="number-hint">{report.review} call{report.review===1?' needs':'s need'} your review{report.review>report.items.length?` · Showing the oldest ${report.items.length}`:''}.</p>
          <Table><TableHeader><TableRow><TableHead>Call</TableHead><TableHead>Reserved</TableHead><TableHead>Needs review</TableHead><TableHead><span className="sr-only">Action</span></TableHead></TableRow></TableHeader><TableBody>{report.items.map(item=><TableRow key={item.id}>
            <TableCell className="whitespace-normal"><p>{item.route} · {item.destination}</p><p className="number-hint">{new Date(item.createdAt).toLocaleString()}</p></TableCell>
            <TableCell>{money(item.heldMicro)}</TableCell><TableCell className="whitespace-normal"><p>{settlementReasons[item.reason??'']??'The final call result needs investigation.'}</p><p className="number-hint">{item.attempts} check{item.attempts===1?'':'s'}</p></TableCell>
            <TableCell><Button size="sm" variant="outline" disabled={busy} onClick={()=>{setSelected(item);setNote('');setError('');}}>Recheck call</Button></TableCell>
          </TableRow>)}</TableBody></Table>
        </>}
        <p className="number-hint">{report.lastAutomaticCheck?`Last automatic check: ${new Date(report.lastAutomaticCheck).toLocaleString()}`:'Automatic recovery has not run in this environment yet.'}{failedRecently?' The latest automatic check failed; use Check due calls while investigating.':''}</p>
      </>}
      <p role="status" className="number-hint">{busy?'Checking…':notice}</p>
    </CardContent>
  </Card>
  <Dialog open={!!selected} onOpenChange={open=>{if(!busy&&!open)setSelected(null);}}><DialogContent showCloseButton={!busy}><DialogHeader><DialogTitle>Recheck this call</DialogTitle><DialogDescription>After investigating the issue, check Twilio again. The accepted rate stays fixed. Credit is released only after the call result is verified.</DialogDescription></DialogHeader>
    <div className="space-y-2"><Label htmlFor="settlement-recheck-note">Reason for recheck</Label><Textarea id="settlement-recheck-note" maxLength={500} value={note} disabled={busy} onChange={event=>setNote(event.target.value)} placeholder="What did you investigate or correct?"/><p className="number-hint">10–500 characters. Saved with your owner action.</p></div>
    {error&&<p role="alert" className="number-error">{error}</p>}<DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setSelected(null)}>Cancel</Button><Button disabled={busy||note.trim().length<10} onClick={()=>void check(true)}>{busy?'Checking…':'Recheck with Twilio'}</Button></DialogFooter>
  </DialogContent></Dialog>
  </section>;
}
