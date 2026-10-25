'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {Alert,AlertTitle,AlertDescription} from '@/components/ui/alert';
import {Button} from '@/components/ui/button';
const money=(value:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:6}).format(value/1000000);
interface CallCharge {id:string;callSid:string|null;status:string;heldMicro:number;chargeMicro:number|null;seconds:number|null;maxSeconds:number}
export function PaidCallStatus({refreshKey}:{refreshKey:string}){
  const [session,setSession]=useState<CallCharge|null>(null),[message,setMessage]=useState('');
  useEffect(()=>{
    let closed=false;const controller=new AbortController();
    async function load(){try{
      const response=await fetch('/api/voice/quote',{cache:'no-store',signal:controller.signal}),data=await response.json();
      if(closed)return;if(!response.ok){setMessage(data.error||'Calling readiness is unavailable.');return;}setMessage('');setSession(data.session);
    }catch{if(!closed)setMessage('Calling credit status is temporarily unavailable.');}}
    void load();const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void load();},10000);
    return()=>{closed=true;controller.abort();window.clearInterval(timer);};
  },[refreshKey]);
  return <Alert><AlertTitle>{message?'Before calling':session?.status==='active'?'Call credit reserved':session?.status==='settled'?'Latest call charge':'Prepaid calling'}</AlertTitle><AlertDescription>
    {message|| (session?.status==='settled'?`${money(session.chargeMicro??0)} charged for ${session.seconds??0} connected seconds at the accepted rate.`:session?.status==='active'?`${money(session.heldMicro)} is held while the call finishes or provider records are reconciled. Refreshing this page does not release an active hold.`:session?.status==='reserved'?`${money(session.heldMicro)} is reserved by an unused permit. It expires automatically; the next status check releases it.`:'Review and accept each rate and maximum charge before dialing. One outstanding call, up to five connected minutes; $10 UTC daily usage cap.')}
    <Button asChild variant="link"><Link href="/console/billing">Open Billing & credit</Link></Button>
  </AlertDescription></Alert>;
}
