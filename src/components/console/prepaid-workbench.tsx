'use client';
import {Badge} from '@/components/ui/badge';
import {WorkspaceSkeleton} from '@/components/console/workspace-skeleton';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,FlaskConical,Phone,RefreshCw,ShieldCheck} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Card,CardHeader,CardTitle,CardDescription,CardContent} from '@/components/ui/card';
import {Alert,AlertTitle,AlertDescription} from '@/components/ui/alert';
import {Label} from '@/components/ui/label';
import {Input} from '@/components/ui/input';
import {Checkbox} from '@/components/ui/checkbox';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {normalizeDialingNumber} from '@/lib/calling-countries';
import {prepaidScenarios,type PrepaidScenario,type PrepaidQuote,type PrepaidView} from '@/lib/prepaid-types';

const money=(micro:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(micro/1000000);
type Result={view:PrepaidView;quote?:PrepaidQuote;error?:string};
export function PrepaidWorkbench(){
  const [view,setView]=useState<PrepaidView|null>(null),[quote,setQuote]=useState<PrepaidQuote|null>(null);
  const [country,setCountry]=useState<'GB'|'AU'>('GB'),[to,setTo]=useState(''),[from,setFrom]=useState('');
  const [scenario,setScenario]=useState<PrepaidScenario>('completed'),[seconds,setSeconds]=useState('60'),[consent,setConsent]=useState(false);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0),[now,setNow]=useState(()=>Date.now());
  const requestVersion=useRef(0),busyRef=useRef(false),session=view?.session;
  const pending=session?.status==='reserved',active=session?.status==='active',inFlight=pending||active;
  const selectedCaller=from||view?.callers[0]?.number||'';
  const expired=Boolean(quote && Date.parse(quote.expiresAt)<=now);
  useEffect(()=>{
    const controller=new AbortController(),version=++requestVersion.current;
    async function load(){
      try{const response=await fetch('/api/billing/prepaid',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'recover'}),signal:controller.signal});const result:Result=await response.json();
        if(!response.ok)throw new Error(result.error||'The prepaid test could not be loaded.');
        if(!controller.signal.aborted && version===requestVersion.current)setView(result.view);
      }catch(issue){if(!controller.signal.aborted && version===requestVersion.current)setError(issue instanceof Error ? issue.message : 'The prepaid test could not be loaded.');}
      finally{if(!controller.signal.aborted && version===requestVersion.current)setLoading(false);}
    }
    void load();return()=>controller.abort();
  },[revision]);
  useEffect(()=>{
    if(!quote && !inFlight)return;
    const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);
  },[quote,inFlight]);
  useEffect(()=>{
    if(!inFlight || busy)return;
    const refresh=()=>{if(!busyRef.current && document.visibilityState==='visible')setRevision(value=>value+1);};
    const timer=setInterval(refresh,5000);window.addEventListener('focus',refresh);
    return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[inFlight,busy]);
  async function perform(body:Record<string,unknown>){
    const version=++requestVersion.current;busyRef.current=true;setBusy(true);setError('');setNotice('');
    try{const response=await fetch('/api/billing/prepaid',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result:Result=await response.json();if(!response.ok)throw new Error(result.error||'The prepaid test could not be completed.');
      if(version!==requestVersion.current)return;setView(result.view);
      if(result.quote){setQuote(result.quote);setConsent(false);}else if(body.action==='reserve'){setQuote(null);setConsent(false);}
      if(body.action==='complete')setNotice('Test result settled. Unused reserved credit has been released.');
      if(body.action==='cancel')setNotice('Reservation canceled. All reserved credit was released without a charge.');
    }catch(issue){setError(issue instanceof Error ? issue.message : 'The prepaid test could not be completed.');setRevision(value=>value+1);}
    finally{busyRef.current=false;setBusy(false);}
  }
  function invalidateQuote(){setQuote(null);setConsent(false);}
  function preview(){const destination=normalizeDialingNumber(to,country);if(!destination){setError('Enter a valid number for the selected destination country.');return;}void perform({action:'quote',to:destination,from:selectedCaller});}
  const disabled=loading||busy;
  const callers=view?.callers??[];
  const displayCallers=inFlight && session && !callers.some(caller=>caller.number===session.from) ? [...callers,{number:session.from,label:'Reserved calling number'}] : callers;
  const resultDone=session?.status==='settled'||session?.status==='released';
  return <main className="shell number-setup-page billing-page prepaid-page">
    <div className="number-page-heading"><div><p className="dialer-eyebrow">BILLING SANDBOX / PREPAID DIALING</p><h1>Billing sandbox</h1><p>Test the full calling-credit flow before opening paid calls.</p></div><Button asChild variant="outline"><Link href="/console/billing"><ArrowLeft aria-hidden="true"/>Billing &amp; credit</Link></Button></div>
    <Alert className="billing-mode-notice"><FlaskConical aria-hidden="true"/><AlertTitle>Test credit · Simulated calls only</AlertTitle><AlertDescription>No recipient is contacted. Rates and outcomes are test fixtures. The call limit and settlement rules are exercised without creating a Twilio call or recording.</AlertDescription></Alert>
    {error && <Alert variant="destructive"><AlertTitle>Prepaid test unavailable</AlertTitle><AlertDescription>{error}<Button variant="outline" disabled={disabled} onClick={()=>{setError('');setLoading(true);setRevision(value=>value+1);}}>Recover state</Button></AlertDescription></Alert>}
    <p role="status" aria-live="polite" className="billing-feedback">{notice}</p>{loading && <WorkspaceSkeleton variant="billing" label="Loading your test calling balance"/>}
    {view && <>
      <div className="prepaid-balances">
        <Card><CardHeader><CardDescription>AVAILABLE TEST CREDIT</CardDescription><CardTitle>{money(view.availableMicro)}</CardTitle></CardHeader><CardContent>Credit available after outstanding holds.</CardContent></Card>
        <Card><CardHeader><CardDescription>RESERVED FOR CALLING</CardDescription><CardTitle>{money(view.heldMicro)}</CardTitle></CardHeader><CardContent>Released after cancellation, expiry or settlement.</CardContent></Card>
        <Card><CardHeader><CardDescription>LAST TEST CHARGE</CardDescription><CardTitle>{resultDone && session?.chargeMicro!==null ? money(session?.chargeMicro??0) : '—'}</CardTitle></CardHeader><CardContent>{resultDone ? session.status==='released' ? 'Unused reservation. No calling charge.' : `${session.seconds??0} connected seconds, rounded to whole minutes.` : 'A test charge appears after settlement.'}</CardContent></Card>
      </div>
      {(!view.subscriptionReady||view.blocked) && <Alert className="billing-mode-notice"><AlertTitle>{view.blocked ? 'Test billing is paused' : 'Complete your test subscription first'}</AlertTitle><AlertDescription>{view.blocked ? 'Existing tests can still be completed or canceled. New credit reservations are blocked.' : 'The rate can be previewed now. Reserving and starting a test requires an active paid test subscription and enough test credit.'}<Button asChild variant="outline"><Link href="/console/billing">Open billing</Link></Button></AlertDescription></Alert>}
      <div className="prepaid-layout">
        <Card><CardHeader><CardTitle>Choose your next test call</CardTitle><CardDescription>Ordinary UK and Australian landlines and mobiles are supported in this sandbox.</CardDescription></CardHeader><CardContent className="billing-form">
          <div><Label htmlFor="prepaid-from">Call from</Label><Select value={inFlight ? session.from : selectedCaller} disabled={disabled||inFlight} onValueChange={value=>{setFrom(value);invalidateQuote();}}><SelectTrigger id="prepaid-from"><SelectValue placeholder="Set up a calling number first"/></SelectTrigger><SelectContent>{displayCallers.map(caller=><SelectItem value={caller.number} key={caller.number}>{caller.label} · {caller.number}</SelectItem>)}</SelectContent></Select></div>
          <div><Label htmlFor="prepaid-country">Destination country</Label><Select value={inFlight ? session.to.startsWith('+61') ? 'AU' : 'GB' : country} disabled={disabled||inFlight} onValueChange={value=>{setCountry(value as 'GB'|'AU');setTo('');invalidateQuote();}}><SelectTrigger id="prepaid-country"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="GB">United Kingdom +44</SelectItem><SelectItem value="AU">Australia +61</SelectItem></SelectContent></Select></div>
          <div><Label htmlFor="prepaid-to">Number to test</Label><Input id="prepaid-to" type="tel" autoComplete="tel" value={inFlight ? session.to : to} disabled={disabled||inFlight} placeholder={country==='GB' ? '020 7946 0123' : '02 9374 4000'} onChange={event=>{setTo(event.target.value);invalidateQuote();}}/></div>
          <Button variant="outline" disabled={disabled||inFlight||!selectedCaller||!to} onClick={preview}>Preview test rate</Button>
          {quote && !inFlight && <Alert className="prepaid-quote"><ShieldCheck aria-hidden="true"/><AlertTitle>{quote.route}</AlertTitle><AlertDescription><p>{money(quote.rateMicro)} per connected minute, rounded up, plus {money(quote.feeMicro)} per started attempt.</p><p>Up to {quote.maxSeconds} connected seconds. Maximum test charge and credit hold: <strong>{money(quote.heldMicro)}</strong>.</p><p>{expired ? 'This quote expired. Preview the rate again.' : `Rate valid until ${new Date(quote.expiresAt).toLocaleTimeString()}.`}</p><Label className="billing-consent"><Checkbox checked={consent} disabled={disabled||expired||!quote.maxSeconds} onCheckedChange={value=>setConsent(value===true)}/>I accept this test rate and maximum charge.</Label><Button disabled={disabled||expired||!consent||!quote.maxSeconds||view.blocked||!view.subscriptionReady} onClick={()=>void perform({action:'reserve',quoteId:quote.id,consent})}>Accept rate &amp; reserve credit</Button></AlertDescription></Alert>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>{pending ? 'Credit reserved. Ready to test.' : active ? 'Your test call is active.' : resultDone ? 'Your last test result' : 'One call. One protected balance.'}</CardTitle><CardDescription>{pending ? 'The rate and maximum charge are fixed for this reservation.' : active ? 'The saved provider result will determine the final test charge.' : 'Start with a rate quote. Credit is held only after you accept it.'}</CardDescription></CardHeader><CardContent className="billing-form">
          {session && <div className="prepaid-session-summary"><strong>{session.to}</strong><p>{session.route}</p><p>{money(session.rateMicro)} / minute + {money(session.feeMicro)} per started attempt</p><p>Maximum connected duration: {session.maxSeconds}s · Hold: {money(session.heldMicro)}</p><Badge className="cost-state" data-state={resultDone ? 'complete' : 'pending'}>{session.status==='released' ? 'Released without charge' : session.status==='settled' ? 'Settled' : pending ? 'Reserved' : 'Active test'}</Badge></div>}
          {pending && <>
            <p className="number-hint">Start within {Math.max(0,Math.ceil((Date.parse(session.expiresAt)-now)/1000))}s or this reservation will expire and release its credit.</p>
            <div><Label htmlFor="prepaid-outcome">Test outcome</Label><Select value={scenario} disabled={disabled} onValueChange={value=>{setScenario(value as PrepaidScenario);setSeconds(value==='completed' ? '60' : '0');}}><SelectTrigger id="prepaid-outcome"><SelectValue/></SelectTrigger><SelectContent>{prepaidScenarios.map(item=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
            {scenario==='completed' && <div><Label htmlFor="prepaid-seconds">Requested test seconds</Label><Input id="prepaid-seconds" type="number" min={0} max={3600} step={1} value={seconds} disabled={disabled} onChange={event=>setSeconds(event.target.value)}/><p className="number-hint">Request more than {session.maxSeconds}s to verify the automatic stop at the reserved limit.</p></div>}
            <Button disabled={disabled||view.blocked||!view.subscriptionReady||Date.parse(session.expiresAt)<=now||!Number.isInteger(Number(seconds))||Number(seconds)<0||Number(seconds)>3600} onClick={()=>void perform({action:'start',id:session.id,scenario,seconds:Number(seconds)})}><Phone aria-hidden="true"/>Start test call</Button>
            <Button variant="outline" disabled={disabled} onClick={()=>void perform({action:'cancel',id:session.id})}>Cancel reservation</Button>
          </>}
          {active && <><p className="prepaid-active-limit">Enforced connected-call limit <strong>{session.maxSeconds}s</strong></p><p>The test outcome is fixed. Closing this page keeps the reservation recoverable. Its saved result can settle after {session.run ? new Date(session.run.finishesAt).toLocaleTimeString() : 'the simulated end time'}.</p><Button disabled={disabled} onClick={()=>void perform({action:'complete',id:session.id})}>Complete test call</Button><p className="number-hint">Complete now fast-forwards the simulated provider. It does not submit a browser-measured duration.</p></>}
          {resultDone && session.run && <div><p>Outcome: {prepaidScenarios.find(item=>item.value===session.run?.scenario)?.label}</p><p>{session.run.connectedSeconds}s connected{session.run.requestedSeconds>session.run.durationLimit ? ` · Stopped at the ${session.run.durationLimit}s limit` : ''}</p><p>Unused credit released: {money(Math.max(0,session.heldMicro-(session.chargeMicro??0)))}</p></div>}
          {!session && <p className="billing-empty">Preview a rate and accept the maximum charge to begin. Only one reservation or active call is allowed at a time.</p>}
          <Button variant="ghost" disabled={disabled} onClick={()=>{setError('');setLoading(true);setRevision(value=>value+1);}}><RefreshCw aria-hidden="true"/>Refresh test state</Button>
        </CardContent></Card>
      </div>
      <p className="cost-footnote">The test cap is $10 per UTC call-start day, with at most five connected minutes per call. An attempt fee applies after starting, including busy, unanswered and failed attempts. Canceling or letting an unused reservation expire costs nothing. These test rules are not a published live offer.</p>
    </>}
  </main>;
}
