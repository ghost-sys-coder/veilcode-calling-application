'use client';
import {Badge} from '@/components/ui/badge';
import {WorkspaceSkeleton} from '@/components/console/workspace-skeleton';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {ArrowUpRight,RefreshCw,DownloadCloud} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Card,CardHeader,CardTitle,CardDescription,CardContent} from '@/components/ui/card';
import {Alert,AlertTitle,AlertDescription} from '@/components/ui/alert';
import {Label} from '@/components/ui/label';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {Table,TableHeader,TableHead,TableBody,TableRow,TableCell,TableCaption} from '@/components/ui/table';
import {costRanges,type CostRange,type CallCostReport,type CostAmounts,type CostCall,type CostSyncResult} from '@/lib/call-cost-types';
import {RateDrafts} from '@/components/console/rate-drafts';

const money=(micro:number,currency:string)=>new Intl.NumberFormat('en-US',{style:'currency',currency,minimumFractionDigits:2,maximumFractionDigits:6}).format(micro/1000000);
const states={untracked:'Not synced',pending:'Price pending',complete:'Published',stale:'Sync needed'};
function Amounts({charges,field='totalMicro'}:{charges:CostAmounts[];field?:'totalMicro'|'browserMicro'|'telephoneMicro'|'recordingMicro'}){
  return charges.length ? <>{charges.map(row=><span className="cost-amount" key={row.currency}>{money(row[field],row.currency)} <small>{row.currency}</small></span>)}</> : <Badge variant="outline">Pending</Badge>;
}
function ResourceCost({call,kind}:{call:CostCall;kind:'browser'|'telephone'|'recording'}){
  const resources=call.resources.filter(resource=>resource.kind===kind),known=resources.filter(resource=>resource.amountMicro!==null);
  if(!resources.length)return <Badge variant="outline">{call.checkedAt && (kind!=='telephone'||call.discoveryComplete) ? 'None' : 'Pending'}</Badge>;
  return <><Amounts charges={call.charges.filter(row=>known.some(resource=>resource.currency===row.currency))} field={`${kind}Micro`}/>{known.length<resources.length && <Badge variant="warning" className="cost-pending">Unpriced usage</Badge>}</>;
}
export function CallCostsWorkspace(){
  const [range,setRange]=useState<CostRange>('30d'),[data,setData]=useState<CallCostReport|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    async function load(){try{const response=await fetch(`/api/admin/call-costs?range=${range}`,{cache:'no-store',signal:controller.signal});const value=await response.json();if(!response.ok)throw new Error(value.error||'Call costs could not be loaded.');if(!controller.signal.aborted){setData(value);setError('');}}
      catch(issue){if(!controller.signal.aborted){setError(issue instanceof Error ? issue.message : 'Call costs could not be loaded.');setData(null);}}
      finally{if(!controller.signal.aborted)setLoading(false);}}
    void load();return()=>controller.abort();
  },[range,revision]);
  function refresh(){setLoading(true);setRevision(value=>value+1);}
  async function sync(){
    setBusy(true);setError('');setNotice('');
    try{const response=await fetch(`/api/admin/call-costs?range=${range}`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const result:CostSyncResult & {error?:string}=await response.json();if(!response.ok)throw new Error(result.error||'Costs could not be synced.');
      setNotice(`${result.synced} call${result.synced===1 ? '' : 's'} synced.${result.failed ? ` ${result.failed} could not be refreshed; saved charges were kept.` : ''}${result.remaining ? ` ${result.remaining} more ready to sync.` : ' Recently checked calls can be retried after one minute.'}${!result.storageSynced ? ' Storage charges were not available; any previous snapshot was kept.' : ''}`);refresh();
    }catch(issue){setError(issue instanceof Error ? issue.message : 'Costs could not be synced.');}finally{setBusy(false);}
  }
  const date=(value:string)=>new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
  return <main className="shell number-setup-page billing-page cost-page">
    <div className="number-page-heading"><div><p className="dialer-eyebrow">OWNER / CALL ECONOMICS</p><h1>Call costs</h1><p>Published provider charges, with every missing price kept in view.</p></div><Button variant="outline" asChild><Link href="/console/billing">Billing &amp; credit<ArrowUpRight aria-hidden="true"/></Link></Button></div>
    <div className="cost-toolbar"><div><Label htmlFor="cost-range">Reporting period</Label><Select value={range} disabled={loading||busy} onValueChange={value=>{setRange(value as CostRange);setData(null);setLoading(true);setNotice('');}}><SelectTrigger id="cost-range"><SelectValue/></SelectTrigger><SelectContent>{costRanges.map(item=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
      <div className="cost-actions"><Button variant="outline" disabled={loading||busy} onClick={refresh}><RefreshCw aria-hidden="true"/>Refresh view</Button><Button disabled={loading||busy||!data} onClick={()=>void sync()}><DownloadCloud aria-hidden="true"/>{busy ? 'Syncing costs…' : 'Sync costs'}</Button></div></div>
    {error && <Alert variant="destructive"><AlertTitle>Costs unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    <p role="status" aria-live="polite" className="billing-feedback">{notice}</p>{loading && !data && <WorkspaceSkeleton variant="billing" label="Loading call costs"/>}
    {data && <>
      <Alert className="billing-mode-notice"><AlertTitle>Provider costs · Owner only</AlertTitle><AlertDescription>These are supplier charges, not customer prices. Calls show connectivity and one-time recording costs. Storage is shown separately for the whole Twilio account. Number rental, taxes, payment fees and other add-ons are excluded.</AlertDescription></Alert>
      <div className="cost-overview">
        <Card><CardHeader><CardDescription>KNOWN CALL CHARGES</CardDescription><CardTitle>{data.calls.length ? <Amounts charges={data.totals}/> : '—'}</CardTitle></CardHeader><CardContent><p>{data.pending ? `Partial amount: ${data.pending} call${data.pending===1 ? '' : 's'} still ${data.pending===1 ? 'needs' : 'need'} complete pricing.` : data.calls.length ? 'All displayed calls have published resource prices.' : 'No saved calls in this period.'}</p><p className="cost-muted">Latest {data.calls.length} saved calls · {data.startDate} to {data.endDate} UTC</p></CardContent></Card>
        <Card><CardHeader><CardDescription>PRICING COVERAGE</CardDescription><CardTitle>{data.complete} / {data.calls.length}</CardTitle></CardHeader><CardContent><p>Calls with every discovered resource priced and finished.</p><p className="cost-muted">{data.due} finished calls ready to sync across this period. Each sync checks up to five.</p></CardContent></Card>
        <Card><CardHeader><CardDescription>ACCOUNT RECORDING STORAGE</CardDescription><CardTitle>{data.storage?.amountMicro!==null && data.storage?.amountMicro!==undefined && data.storage.currency ? money(data.storage.amountMicro,data.storage.currency) : 'Pending'}</CardTitle></CardHeader><CardContent><p>Twilio account usage for {data.startDate} to {data.endDate} UTC. Includes recordings outside this call sample.</p><p className="cost-muted">{data.storage ? `Checked ${date(data.storage.checkedAt)}${data.storage.asOf ? ` · Provider data as of ${date(data.storage.asOf)}` : ''}` : 'Sync costs to fetch the account storage snapshot.'}</p></CardContent></Card>
      </div>
      <Card className="cost-ledger"><CardHeader><CardTitle>Call cost breakdown</CardTitle><CardDescription>Both call legs are checked, including failed attempts. Missing prices remain pending. Deleted recordings retain any charge already captured.</CardDescription></CardHeader><CardContent>
        {!data.calls.length ? <p className="billing-empty">No saved calls in this period. Choose a longer period, or sync recent calls from call history first.</p> : <Table><TableCaption>Latest 100 saved calls in the selected UTC period. {data.hasMore ? 'Older calls exist outside this sample. ' : ''}Amounts are grouped by currency and exclude account storage.</TableCaption><TableHeader><TableRow><TableHead>Call / route</TableHead><TableHead>Browser leg</TableHead><TableHead>Telephone legs</TableHead><TableHead>Recording</TableHead><TableHead>Known cost</TableHead><TableHead>Pricing</TableHead></TableRow></TableHeader><TableBody>{data.calls.map(call=><TableRow key={call.callSid}>
          <TableCell><div className="cost-call"><strong>{call.to||'No telephone destination'}</strong><span>{call.route}</span><time dateTime={call.startedAt}>{date(call.startedAt)}</time><span>{call.status.replaceAll('-',' ')} · {call.duration}s connected</span>{call.canReview && <Button asChild variant="link" size="sm"><Link href={`/console/history?call=${call.callSid}`}>Review call<ArrowUpRight aria-hidden="true"/></Link></Button>}</div></TableCell>
          <TableCell><ResourceCost call={call} kind="browser"/></TableCell><TableCell><ResourceCost call={call} kind="telephone"/></TableCell><TableCell><ResourceCost call={call} kind="recording"/></TableCell><TableCell><Amounts charges={call.charges}/>{call.state!=='complete' && <Badge variant="warning" className="cost-pending">Incomplete</Badge>}</TableCell><TableCell><Badge className="cost-state" data-state={call.state}>{states[call.state]}</Badge>{call.checkedAt && <small className="cost-checked">Checked {date(call.checkedAt)}</small>}</TableCell>
        </TableRow>)}</TableBody></Table>}
      </CardContent></Card>
      <p className="cost-footnote">New finished-call callbacks capture costs automatically. Sync costs checks saved calls again when Twilio publishes delayed prices. Sync recent calls in call history to import older activity. This report does not debit calling credit.</p>
    </>}
    <RateDrafts range={range} refreshKey={revision}/>
  </main>;
}
