'use client';
import Link from 'next/link';
import {useState} from 'react';
import {Card,CardContent,CardHeader,CardTitle,CardDescription} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Checkbox} from '@/components/ui/checkbox';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Alert,AlertTitle,AlertDescription} from '@/components/ui/alert';
import {emptyPilotOffer,type PilotOffer,type PilotAdminView} from '@/lib/pilot-types';
import {draftRoutes} from '@/lib/rate-draft-types';
import {draftDollarMicro,draftDollarText} from '@/lib/rate-draft-values';
import {policyDocuments,policyEdition} from '@/lib/legal-policies';

export function PilotSetup(){
  const [open,setOpen]=useState(false),[view,setView]=useState<PilotAdminView|null>(null),[offer,setOffer]=useState<PilotOffer>(emptyPilotOffer);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirmation,setConfirmation]=useState('');
  const [from,setFrom]=useState(''),[prices,setPrices]=useState<Record<string,{minute:string;attempt:string}>>({});
  async function load(){setBusy(true);setError('');setNotice('');try{
    const response=await fetch('/api/admin/pilot',{cache:'no-store'}),data=await response.json();if(!response.ok)throw new Error(data.error);
    setView(data);setOffer(data.draft?.config??structuredClone(emptyPilotOffer));setFrom('');setPrices({});setOpen(true);
  }catch(error){setError((error as Error).message);}finally{setBusy(false);}}
  async function action(action:'stage'|'activate'|'pause'){
    if(!view)return;setBusy(true);setError('');setNotice('');try{
      const response=await fetch('/api/admin/pilot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,revision:view.revision,...(action==='stage'?{config:offer}:{}),...(action==='activate'?{confirmation}:{})})});
      const data=await response.json();if(!response.ok)throw new Error(data.error);setView(data);setOffer(data.draft?.config??structuredClone(emptyPilotOffer));setConfirmation('');
      setNotice(action==='stage'?'Private offer saved. Nothing has been published.':action==='pause'?'New payments and paid calls are paused. Existing usage can still settle.':'The approved paid pilot is open.');
    }catch(error){setError((error as Error).message);}finally{setBusy(false);}
  }
  function selectFrom(value:string){setFrom(value);setPrices(Object.fromEntries(draftRoutes.map(row=>{const price=offer.rates[value]?.[row.key];return [row.key,{minute:price?draftDollarText(price.rateMicro):'',attempt:price?draftDollarText(price.feeMicro):''}];})));}
  function applyRates(){setError('');try{
    if(!/^\+[1-9]\d{7,14}$/.test(from))throw new Error('Enter the exact outgoing number in international format.');
    const rates={...offer.rates},selected:typeof rates[string]={};
    for(const row of draftRoutes){const price=prices[row.key];if(!price?.minute&&!price?.attempt)continue;selected[row.key]={rateMicro:draftDollarMicro(price?.minute),feeMicro:draftDollarMicro(price?.attempt||'0',true)};}
    if(Object.keys(selected).length)rates[from]=selected;else delete rates[from];setOffer({...offer,rates});setNotice('Rates added to this form. Save the private offer to retain them.');
  }catch(error){setError((error as Error).message);}}
  return <Card><CardHeader><CardTitle>Paid pilot setup</CardTitle><CardDescription>One place for the offer, service policies and approved caller-specific rates.</CardDescription></CardHeader><CardContent>
    <Button variant="outline" disabled={busy} onClick={()=>void load()}>Review pilot setup</Button>{error&&!open&&<p role="alert" className="number-error">{error}</p>}
    <Dialog open={open} onOpenChange={next=>{if(!busy)setOpen(next);}}><DialogContent className="pilot-setup-dialog"><DialogHeader><DialogTitle>Prepare the paid pilot</DialogTitle><DialogDescription>Owner controls · USD · Saving creates a private revision. Review saved policies before approving publication.</DialogDescription></DialogHeader>
      <fieldset disabled={busy} className="pilot-setup-form"><div className="pilot-fields">{([['name','Legal service operator'],['country','Business country'],['address','Business address'],['email','Support and privacy email']] as const).map(([key,label])=><div key={key}><Label htmlFor={`pilot-${key}`}>{label}</Label><Input id={`pilot-${key}`} value={offer.operator[key]} onChange={event=>setOffer({...offer,policiesApproved:false,operator:{...offer.operator,[key]:event.target.value}})}/></div>)}
        <div><Label htmlFor="pilot-monthly">Monthly price (USD)</Label><Input id="pilot-monthly" type="number" min="1" max="1000" step="0.01" value={offer.monthlyCents===null?'':offer.monthlyCents/100} onChange={event=>setOffer({...offer,monthlyCents:event.target.value===''?null:Math.round(Number(event.target.value)*100)})}/></div>
        <div><Label htmlFor="pilot-price">Live Stripe monthly Price ID</Label><Input id="pilot-price" placeholder="price_…" value={offer.priceId} onChange={event=>setOffer({...offer,priceId:event.target.value})}/></div>
      </div><p>Approved credit purchases: {offer.topups.map(amount=>`$${amount/100}`).join(', ')}. Renewal adds no calling credit.</p>
      <div className="pilot-fields">{policyDocuments.map(row=><div key={row.key}><Label htmlFor={`pilot-policy-${row.key}`}>{row.label} URL</Label><Input id={`pilot-policy-${row.key}`} type="url" value={offer.policies[row.key]} onChange={event=>setOffer({...offer,policiesApproved:false,policies:{...offer.policies,[row.key]:event.target.value}})}/></div>)}<div><Label htmlFor="pilot-policy-revision">Policy revision</Label><Input id="pilot-policy-revision" value={offer.policies.revision} onChange={event=>setOffer({...offer,policiesApproved:false,policies:{...offer.policies,revision:event.target.value}})}/></div></div>
      <div className="billing-actions"><Button variant="outline" type="button" onClick={()=>setOffer({...offer,policiesApproved:false,policies:{terms:`${window.location.origin}/legal/terms`,privacy:`${window.location.origin}/legal/privacy`,recording:`${window.location.origin}/legal/recording`,credit:`${window.location.origin}/legal/credit`,revision:policyEdition}})}>Use VeilCall policy drafts</Button><Button asChild variant="ghost"><Link target="_blank" href={`/legal/terms${view?.draft?`?offer=${view.draft.id}`:''}`}>Read all saved policies</Link></Button></div>
      <Label className="billing-consent"><Checkbox checked={offer.policiesApproved} onCheckedChange={checked=>setOffer({...offer,policiesApproved:checked===true})}/>I approve the saved policy wording and business details for publication.</Label>
      <Label className="billing-consent"><Checkbox checked={offer.taxReviewed} onCheckedChange={checked=>setOffer({...offer,taxReviewed:checked===true})}/>Tax treatment has been reviewed. Prices include any tax we must account for; automatic tax is not enabled.</Label>
      <section><h3>Caller-specific rates</h3><p>Add only rates you approve after checking <Link href="/console/costs" target="_blank">Call costs</Link>. Sandbox prices are not copied.</p><Label htmlFor="pilot-from">Exact outgoing number</Label><Input id="pilot-from" type="tel" value={from} onChange={event=>selectFrom(event.target.value)} placeholder="+44…"/>
        {draftRoutes.map(row=><div key={row.key} className="pilot-fields"><div><Label htmlFor={`pilot-rate-${row.key}`}>{row.label} · USD/minute</Label><Input id={`pilot-rate-${row.key}`} inputMode="decimal" value={prices[row.key]?.minute??''} onChange={event=>setPrices({...prices,[row.key]:{minute:event.target.value,attempt:prices[row.key]?.attempt??''}})}/></div><div><Label htmlFor={`pilot-fee-${row.key}`}>USD/attempt</Label><Input id={`pilot-fee-${row.key}`} inputMode="decimal" value={prices[row.key]?.attempt??''} onChange={event=>setPrices({...prices,[row.key]:{minute:prices[row.key]?.minute??'',attempt:event.target.value}})}/></div></div>)}
        <Button type="button" variant="outline" onClick={applyRates}>Apply rates to this draft</Button><p>Included callers: {Object.keys(offer.rates).join(', ')||'None yet'}. Apply empty route amounts to remove a caller.</p>
      </section>
      {!!view?.issues.length&&<Alert><AlertTitle>Before activation</AlertTitle><AlertDescription><ul>{view.issues.map(issue=><li key={issue}>{issue}</li>)}</ul></AlertDescription></Alert>}
      {error&&<p role="alert" className="number-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
      <div className="billing-actions"><Button type="button" onClick={()=>void action('stage')}>Save private offer</Button><Button type="button" variant="outline" onClick={()=>void action('pause')} disabled={!view?.active||view.paused}>Pause new paid activity</Button></div>
      {view?.releaseEnabled&&<div><Label htmlFor="pilot-confirm">Type OPEN PAID PILOT to publish the saved offer and open payments</Label><Input id="pilot-confirm" value={confirmation} onChange={event=>setConfirmation(event.target.value)}/><Button type="button" disabled={!!view.issues.length||confirmation!=='OPEN PAID PILOT'} onClick={()=>void action('activate')}>Activate saved offer</Button></div>}
      <p className="number-hint">Closing discards unsaved form changes. Preview cannot activate live commerce. Pausing never erases credit or releases active-call holds.</p>
      </fieldset>
    </DialogContent></Dialog></CardContent>
  </Card>;
}
