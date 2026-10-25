import {costRanges,type CostRange,type CostResource,type CostAmounts} from '@/lib/call-cost-types';

export function costRange(value:string|null):CostRange|null {
  return value===null ? '30d' : costRanges.some(item=>item.value===value) ? value as CostRange : null;
}
export function costPeriod(range:CostRange,now=new Date()) {
  const days=costRanges.find(item=>item.value===range)!.days;
  const start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-days+1));
  return {startDate:start.toISOString().slice(0,10),endDate:now.toISOString().slice(0,10)};
}
// Twilio reports debits as negative call prices and may return positive recording
// prices. Store a positive supplier cost, preserving exact decimal micro-units.
export function providerCost(price:unknown,unit:unknown):{amountMicro:number;currency:string}|null {
  if(typeof price!=='string' || typeof unit!=='string')return null;
  const currency=unit.trim().toUpperCase(),match=/^[+-]?(\d{1,9})(?:\.(\d{1,12}))?$/.exec(price.trim());
  if(!/^[A-Z]{3}$/.test(currency) || !match || /[1-9]/.test((match[2]??'').slice(6)))return null;
  const amount=BigInt(match[1])*BigInt(1000000)+BigInt((match[2]??'').slice(0,6).padEnd(6,'0'));
  if(amount>BigInt(Number.MAX_SAFE_INTEGER))return null;
  return {amountMicro:Number(amount),currency};
}
export function providerDuration(value:unknown):number|null {
  if(typeof value!=='string' && typeof value!=='number')return null;
  if(value==='' || (typeof value==='string' && !/^\d+$/.test(value)))return null;
  const seconds=Number(value);return Number.isSafeInteger(seconds) && seconds>=0 && seconds<=86400 ? seconds : null;
}
export function terminalCostResource(resource:CostResource):boolean {
  return (resource.kind==='recording' ? ['completed','absent','deleted'] : ['completed','busy','failed','no-answer','canceled']).includes(resource.status);
}
export function mergeCostResources(previous:CostResource[],incoming:CostResource[]):CostResource[] {
  const resources=new Map(previous.map(resource=>[resource.sid,resource]));
  for(const next of incoming){
    const old=resources.get(next.sid);
    if(old && old.kind!==next.kind)throw new Error('Provider resource association changed.');
    resources.set(next.sid,{...next,
      ...(next.amountMicro===null && old?.amountMicro!==null && old?.amountMicro!==undefined ? {amountMicro:old.amountMicro,currency:old.currency} : {}),
      ...(old && terminalCostResource(old) && !terminalCostResource(next) ? {status:old.status} : {}),
      durationSeconds:next.durationSeconds??old?.durationSeconds??null,
    });
  }
  return [...resources.values()].sort((a,b)=>a.sid.localeCompare(b.sid));
}
export function sumCostResources(resources:CostResource[]):CostAmounts[] {
  const amounts=new Map<string,CostAmounts>();
  for(const resource of resources){
    if(resource.amountMicro===null || !resource.currency)continue;
    const row=amounts.get(resource.currency)??{currency:resource.currency,browserMicro:0,telephoneMicro:0,recordingMicro:0,totalMicro:0};
    row[`${resource.kind}Micro`]+=resource.amountMicro;row.totalMicro+=resource.amountMicro;
    if(!Number.isSafeInteger(row.totalMicro))throw new Error('Provider cost exceeds supported precision.');
    amounts.set(row.currency,row);
  }
  return [...amounts.values()].sort((a,b)=>a.currency.localeCompare(b.currency));
}
