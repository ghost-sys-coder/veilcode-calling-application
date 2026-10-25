import {after} from 'next/server';
import {verifiedVoiceWebhook} from '@/lib/voice-webhook';
import {wakeTwilioSettlement} from '@/lib/twilio-settlement-store';
import {reconcileTwilioSettlements} from '@/lib/twilio-settlement-service';
export const runtime='nodejs';
export const maxDuration=60;
const sid=/^CA[0-9a-f]{32}$/;
const terminal=['completed','busy','failed','no-answer','canceled'];
export async function POST(request:Request) {
  try {
    const params=await verifiedVoiceWebhook(request,'/api/voice/prepaid/callback');
    if(!params)return new Response('Invalid call callback',{status:403});
    // Dial action uses CallSid for the parent; Number callbacks use ParentCallSid.
    // Values merely wake the bound job. No webhook duration or price is trusted.
    const action=Object.hasOwn(params,'DialCallStatus');
    const parent=action ? params.CallSid : params.ParentCallSid;
    const child=action ? params.DialCallSid : params.CallSid;
    const status=action ? params.DialCallStatus : params.CallStatus;
    if(!sid.test(parent??'') || !terminal.includes(status) ||
      (child!==undefined && (!sid.test(child)||child===parent)) || (!action&&!child) || (action&&params.ParentCallSid))
      return new Response('Invalid call outcome',{status:400});
    await wakeTwilioSettlement(params.AccountSid,parent);
    // The action may arrive just before the parent is terminal. A durable retry
    // is already scheduled even if the serverless after hook is interrupted.
    after(async()=>{try{await reconcileTwilioSettlements(parent);}catch{console.error('Prepaid call reconciliation is temporarily unavailable.');}});
    return action ? new Response('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>',{
      headers:{'Content-Type':'text/xml','Cache-Control':'no-store'},
    }) : new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});
  } catch{return new Response('Call reconciliation unavailable',{status:503});}
}
