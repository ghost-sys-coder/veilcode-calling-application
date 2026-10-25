'use client';
import {useState} from 'react';
import {Card,CardContent,CardHeader,CardTitle,CardDescription} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {Label} from '@/components/ui/label';
import {Badge} from '@/components/ui/badge';
import {policyDocuments} from '@/lib/legal-policies';
import type {BillingSummary} from '@/lib/billing-types';
export function PolicyAgreement({offer,enabled,onAccepted}:{offer:NonNullable<BillingSummary['offer']>;enabled:boolean;onAccepted:()=>Promise<void>}){
  const [accepted,setAccepted]=useState(false),[immediate,setImmediate]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  function href(url:string){const value=new URL(url);if(value.pathname.startsWith('/legal/'))value.searchParams.set('offer',offer.id);return value.toString();}
  async function save(){setBusy(true);setError('');try{
    const response=await fetch('/api/billing/policies',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({offerId:offer.id,accepted,immediate})});
    const data=await response.json();if(!response.ok)throw new Error(data.error);await onAccepted();
  }catch(error){setError((error as Error).message);}finally{setBusy(false);}}
  return <Card className="billing-agreement" aria-labelledby="service-agreement-title"><CardHeader><CardTitle><h2 id="service-agreement-title">Your service agreement</h2></CardTitle><CardDescription>Review the policies before activating paid calling. Save or print the Terms page to retain all four documents.</CardDescription></CardHeader><CardContent>
    <div className="billing-agreement-status"><Badge variant={offer.accepted?'secondary':'outline'}>{offer.accepted?'Agreement accepted':'Agreement required'}</Badge></div>
    <div className="billing-actions">{policyDocuments.map(document=><Button key={document.key} asChild variant="outline"><a href={href(offer.policies[document.key])} target="_blank" rel="noopener noreferrer">{document.label}</a></Button>)}</div>
    {offer.accepted?<p>{offer.serviceReady?'You accepted this offer. Each call still requires separate acceptance of its rate and maximum charge.':'You accepted this offer without requesting immediate service. Calling begins after the 14-day waiting period; contact support if you need help.'}</p>:<>
      <Label className="billing-consent"><Checkbox checked={accepted} disabled={busy} onCheckedChange={value=>setAccepted(value===true)}/><span><strong>I agree to the service policies</strong><span className="billing-consent-detail">I agree to the Terms of service, Recording policy and Credit, cancellation &amp; refunds policy, and acknowledge the Privacy notice.</span></span></Label>
      <Label className="billing-consent"><Checkbox checked={immediate} disabled={busy} onCheckedChange={value=>setImmediate(value===true)}/><span><strong>Begin service immediately <Badge variant="outline">Optional</Badge></strong><span className="billing-consent-detail">I expressly request service to begin immediately, including during any cooling-off period. This does not waive my statutory cancellation rights; a lawful proportionate charge may apply for service supplied before cancellation.</span></span></Label>
      <p>Without an immediate-start request, paid calling begins after 14 days. Monthly subscription and calling credit are separate purchases.</p>
      <Button disabled={busy||!accepted||!enabled} onClick={()=>void save()}>{busy?'Saving…':'Accept this agreement'}</Button>
    </>}<p className="billing-policy-revision">Policy revision: {offer.policies.revision}</p>{error&&<p role="alert" className="number-error">{error}</p>}
  </CardContent></Card>;
}
