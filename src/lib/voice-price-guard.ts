import 'server-only';
import {BillingError} from '@/lib/billing-config';
import {voiceService} from '@/lib/voice-service';
import {draftDollarMicro} from '@/lib/rate-draft-values';
import type {DraftPrice} from '@/lib/rate-draft-types';

const unavailable=()=>new BillingError('Pricing is temporarily unavailable for this destination. Try again later.',503);
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));

export function coveredVoicePrice(snapshot:unknown,to:string,from:string,price:DraftPrice):void {
  const country=to.startsWith('+44')?'GB':to.startsWith('+61')?'AU':null;
  if(!country||!record(snapshot)||snapshot.destinationNumber!==to||snapshot.originationNumber!==from||
    snapshot.isoCountry!==country||snapshot.priceUnit!=='USD'||!Array.isArray(snapshot.outboundCallPrices)||
    !snapshot.outboundCallPrices.length||snapshot.outboundCallPrices.length>100)throw unavailable();
  const matched:number[]=[];
  for(const row of snapshot.outboundCallPrices){
    if(!record(row)||!Array.isArray(row.originationPrefixes)||!row.originationPrefixes.length||
      row.originationPrefixes.some(prefix=>typeof prefix!=='string'||!(prefix==='ALL'||/^\d{1,15}$/.test(prefix))))throw unavailable();
    if(!row.originationPrefixes.some(prefix=>prefix==='ALL'||from.slice(1).startsWith(prefix)))continue;
    if(typeof row.currentPrice!=='string'&&typeof row.currentPrice!=='number')throw unavailable();
    try{matched.push(draftDollarMicro(String(row.currentPrice),true));}catch{throw unavailable();}
  }
  if(!matched.length)throw unavailable();
  // Use the most expensive matching tariff, never a cheaper fallback. Include
  // browser audio ($.004), recording ($.0025) and 30-day storage ($.0005) per
  // connected minute. An extra browser minute covers ringing/rounding. These
  // are a conservative supplier-cost floor, not a profit or tax calculation.
  if(!Number.isSafeInteger(price.rateMicro)||!Number.isSafeInteger(price.feeMicro)||
    price.rateMicro<Math.max(...matched)+7000||price.feeMicro<4000)
    throw new BillingError('This destination is not available at the approved calling rate. Choose another number or contact support.',409);
}

export async function assertVoicePriceCovered(to:string,from:string,price:DraftPrice):Promise<void>{
  let snapshot:unknown;
  try{snapshot=await voiceService().pricing.v2.voice.numbers(to).fetch({originationNumber:from});}
  catch{throw unavailable();}
  coveredVoicePrice(snapshot,to,from,price);
}
