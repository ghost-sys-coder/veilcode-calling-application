'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Card,CardHeader,CardTitle,CardDescription,CardContent} from '@/components/ui/card';
import {Alert,AlertDescription} from '@/components/ui/alert';
import {Label} from '@/components/ui/label';
import {Input} from '@/components/ui/input';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {draftRoutes,type DraftRoute,type RateDraft,type RateDraftView} from '@/lib/rate-draft-types';
import {draftDollarMicro,draftDollarText,rateCoverage} from '@/lib/rate-draft-values';
import type {CostRange} from '@/lib/call-cost-types';
type Fields=Record<DraftRoute,{perMinute:string;attempt:string}>;
const fieldsFor=(draft:RateDraft)=>Object.fromEntries(draftRoutes.map(({key})=>[key,{perMinute:draft.rates[key]?draftDollarText(draft.rates[key]!.rateMicro):'',attempt:draft.rates[key]?draftDollarText(draft.rates[key]!.feeMicro):'0'}])) as Fields;
const money=(micro:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:6}).format(micro/1000000);
export function RateDrafts({range,refreshKey}:{range:CostRange;refreshKey:number}){
  const [view,setView]=useState<RateDraftView|null>(null),[from,setFrom]=useState<string|null>(null),[base,setBase]=useState<RateDraft>({revision:0,rates:{},updatedAt:null});
  const [fields,setFields]=useState<Fields>(()=>fieldsFor({revision:0,rates:{},updatedAt:null})),[dirty,setDirty]=useState(false),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
  const [loadError,setLoadError]=useState(''),[saveError,setSaveError]=useState(''),[notice,setNotice]=useState(''),[reload,setReload]=useState(0);
  const dirtyRef=useRef(false),loadedFrom=useRef(''),version=useRef(0),working=useRef(false);
  useEffect(()=>{
    const controller=new AbortController(),requestVersion=++version.current;
    const params=new URLSearchParams({range});if(from)params.set('from',from);
    async function load(){setLoading(true);try{
      const response=await fetch(`/api/admin/rate-drafts?${params}`,{cache:'no-store',signal:controller.signal}),data=await response.json();
      if(!response.ok)throw new Error(data.error||'Draft rates could not be loaded.');
      if(!controller.signal.aborted&&version.current===requestVersion){
        setView(data);setLoadError('');
        if(loadedFrom.current!==data.from||!dirtyRef.current){setBase(data.draft);setFields(fieldsFor(data.draft));setDirty(false);dirtyRef.current=false;}
        loadedFrom.current=data.from;
      }
    }catch(error){if(!controller.signal.aborted&&version.current===requestVersion)setLoadError((error as Error).message);}
      finally{if(!controller.signal.aborted&&version.current===requestVersion)setLoading(false);}}
    void load();return()=>controller.abort();
  },[range,from,refreshKey,reload]);
  function edit(route:DraftRoute,field:'perMinute'|'attempt',value:string){setFields(previous=>({...previous,[route]:{...previous[route],[field]:value}}));dirtyRef.current=true;setDirty(true);setSaveError('');setNotice('');}
  function discard(){dirtyRef.current=false;setDirty(false);setFields(fieldsFor(base));setSaveError('');setNotice('');setReload(value=>value+1);}
  async function save(){
    if(working.current||!view)return;working.current=true;setSaving(true);setSaveError('');setNotice('');++version.current;
    try{
      const rates:Record<string,{perMinute:string;attempt:string}>={};
      for(const {key,label} of draftRoutes){const row=fields[key],perMinute=row.perMinute.trim(),attempt=row.attempt.trim()||'0';
        if(!perMinute)continue;
        try{draftDollarMicro(perMinute);draftDollarMicro(attempt,true);}catch(error){throw new Error(`${label}: ${(error as Error).message}`);}
        rates[key]={perMinute,attempt};
      }
      const response=await fetch('/api/admin/rate-drafts',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({from:view.from,revision:base.revision,rates})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Draft rates could not be saved.');
      ++version.current;setBase(data.draft);setFields(fieldsFor(data.draft));dirtyRef.current=false;setDirty(false);setNotice('Draft saved. Customer prices and test rates are unchanged.');
    }catch(error){setSaveError((error as Error).message);}
    finally{working.current=false;setSaving(false);setReload(value=>value+1);}
  }
  const matching=view&&(!from||view.from===from),sampleReady=matching&&!loading&&!loadError&&view.range===range;
  return <section aria-labelledby="draft-rates-title"><Card><CardHeader><CardTitle><h2 id="draft-rates-title">Draft calling rates</h2></CardTitle><CardDescription>Try USD prices against observed Twilio costs for your calling number. Drafts are private and never used to charge a customer.</CardDescription></CardHeader><CardContent className="space-y-5">
    {view&&!!view.callers.length&&<div className="max-w-lg space-y-2"><Label htmlFor="draft-caller">Calling number for this draft</Label><Select value={from??view.from} disabled={dirty||saving||loading} onValueChange={value=>{setFrom(value);setSaveError('');setNotice('');}}><SelectTrigger id="draft-caller"><SelectValue/></SelectTrigger><SelectContent>{view.callers.map(caller=><SelectItem key={caller.number} value={caller.number}>{caller.label} · {caller.number}</SelectItem>)}</SelectContent></Select>{dirty&&<p className="number-hint">Save or discard changes before switching calling numbers.</p>}</div>}
    {loadError&&<Alert variant="destructive"><AlertDescription>{loadError}<Button variant="outline" size="sm" onClick={()=>setReload(value=>value+1)} disabled={saving}>Retry draft load</Button></AlertDescription></Alert>}
    {loading&&<p role="status" className="number-hint">Loading draft rates and observed costs…</p>}
    {matching&&!view.callers.length&&<p>Add an active calling number in Phone numbers before drafting rates.</p>}
    {matching&&!!view.callers.length&&<>
      <p className="number-hint">Prices round connected seconds up to whole minutes for each call, plus the attempt fee. Blank per-minute rates are unset.</p>
      <div className="grid gap-4 md:grid-cols-2">{draftRoutes.map(({key,label})=>{
        let price;try{if(fields[key].perMinute.trim())price={rateMicro:draftDollarMicro(fields[key].perMinute.trim()),feeMicro:draftDollarMicro(fields[key].attempt.trim()||'0',true)};}catch{}
        const coverage=sampleReady?rateCoverage(view.sample.observations,key,price):null;
        return <div key={key} role="group" aria-label={label} className="min-w-0 space-y-3 rounded-lg border p-4"><h3 className="font-semibold">{label}</h3><div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label htmlFor={`draft-minute-${key}`}>USD / minute</Label><Input id={`draft-minute-${key}`} inputMode="decimal" maxLength={12} value={fields[key].perMinute} placeholder="Not set" disabled={saving||loading} onChange={event=>edit(key,'perMinute',event.target.value)}/></div>
          <div className="space-y-2"><Label htmlFor={`draft-attempt-${key}`}>USD / attempt</Label><Input id={`draft-attempt-${key}`} inputMode="decimal" maxLength={12} value={fields[key].attempt} disabled={saving||loading} onChange={event=>edit(key,'attempt',event.target.value)}/></div>
        </div>
        {coverage&&<div className="space-y-1 text-sm"><p>{coverage.calls} complete USD call{coverage.calls===1?'':'s'} · {coverage.recorded} with recordings</p>
          {!!coverage.calls&&<><p>Observed direct cost: {money(coverage.supplierMicro)}</p>{price&&coverage.revenueMicro!==null&&<><p>Draft charges: {money(coverage.revenueMicro)} · Difference: {money(coverage.differenceMicro!)}</p><p className={coverage.losingCalls?'text-destructive':'number-hint'}>{coverage.losingCalls?`${coverage.losingCalls} call${coverage.losingCalls===1?' costs':'s cost'} more than this draft would charge.`:'This draft covers the observed direct costs in this sample.'}</p>
            {!!coverage.uncoveredAttempts&&<p className="text-destructive">{coverage.uncoveredAttempts} call{coverage.uncoveredAttempts===1?' has':'s have'} no connected time and {coverage.uncoveredAttempts===1?'costs':'cost'} more than this attempt fee.</p>}
            {coverage.minimumRateMicro!==null&&<p className="number-hint">At this attempt fee, at least {money(coverage.minimumRateMicro)} / minute covers the connected calls in this sample.</p>}</>}{!price&&<p className="number-hint">Enter valid amounts to compare draft charges.</p>}</>}
          {!coverage.calls&&<p className="number-hint">No complete USD calls yet. More data is needed to assess this route.</p>}
        </div>}
      </div>;})}</div>
      {sampleReady&&<p className="number-hint">Compared {view.sample.observations.length} of {view.sample.examined} saved calls from {view.sample.startDate} to {view.sample.endDate} UTC{view.sample.hasMore?' · Latest 100; older calls exist':''}. Excluded: {view.sample.excluded.incomplete} incomplete or stale costs, {view.sample.excluded.currency} non-USD, {view.sample.excluded.route} unsupported routes, {view.sample.excluded.duration} unavailable or inconsistent durations. Use Sync costs above to refresh provider prices.</p>}
      <p className="number-hint">This comparison uses historical browser, telephone and recording creation costs. Payment fees, number rental, recording storage, taxes, other add-ons and subscription income are outside the calculation.</p>
      {saveError&&<p role="alert" className="number-error">{saveError}</p>}<div className="flex flex-wrap items-center gap-3"><Button disabled={!dirty||saving||loading} onClick={()=>void save()}>{saving?'Saving…':'Save draft rates'}</Button><Button variant="outline" disabled={!dirty||saving} onClick={discard}>Discard changes</Button><span className="number-hint">{base.updatedAt?`Saved ${new Date(base.updatedAt).toLocaleString()}`:'No saved draft for this number.'}</span></div>
      <p role="status" className="number-hint">{notice}</p>
    </>}
  </CardContent></Card></section>;
}
