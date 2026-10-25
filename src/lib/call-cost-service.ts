import 'server-only';
import {parsePhoneNumberFromString} from 'libphonenumber-js/max';
import {voiceService} from '@/lib/voice-service';
import {claimCostCalls,costRecordingReferences,saveCallCosts,failCallCosts,dueCostCalls,saveStorageCost,type CostSource} from '@/lib/call-cost-store';
import {costPeriod,providerCost,providerDuration} from '@/lib/call-cost-values';
import type {CostRange,CostResource,CostKind,CostSyncResult} from '@/lib/call-cost-types';

function resource(record:{sid:string;status:string;duration:unknown;price:unknown;priceUnit:unknown},kind:CostKind):CostResource {
  const cost=providerCost(record.price,record.priceUnit);
  return {sid:record.sid,kind,status:record.status,durationSeconds:providerDuration(record.duration),amountMicro:cost?.amountMicro??null,currency:cost?.currency??null};
}
export async function reconcileCallCost(source:CostSource):Promise<void> {
  const client=voiceService(),accountSid=process.env.TWILIO_ACCOUNT_SID?.trim();
  const parent=await client.calls(source.callSid).fetch();
  if(parent.sid!==source.callSid || parent.accountSid!==accountSid || parent.parentCallSid || parent.from!==`client:${source.operatorId}`)
    throw new Error('Provider call ownership does not match.');
  const [children,recordings,stored]=await Promise.all([
    client.calls.list({parentCallSid:parent.sid,limit:11}),
    client.recordings.list({callSid:parent.sid,limit:101}),
    costRecordingReferences(parent.sid),
  ]);
  // Reaching a request bound is an incomplete enumeration, never a zero cost.
  if(children.length>10 || recordings.length>100 || stored.length>100)throw new Error('Provider cost enumeration limit reached.');
  if(children.some(child=>child.accountSid!==accountSid || child.parentCallSid!==parent.sid || !/^CA[0-9a-f]{32}$/i.test(child.sid)) ||
    recordings.some(record=>record.accountSid!==accountSid || record.callSid!==parent.sid || !/^RE[0-9a-f]{32}$/i.test(record.sid)))
    throw new Error('Provider resource association does not match.');
  const resources=[resource(parent,'browser'),...children.map(child=>resource(child,'telephone')),...recordings.map(record=>resource(record,'recording'))];
  const seen=new Set(resources.map(item=>item.sid));
  if(seen.size!==resources.length)throw new Error('Duplicate provider resource.');
  // Deleted audio can disappear from provider lists. Keep its known charge, or
  // an explicit unknown charge, instead of erasing the historical recording cost.
  for(const record of stored)if(!seen.has(record.sid))resources.push({sid:record.sid,kind:'recording',status:record.status,durationSeconds:record.duration,amountMicro:null,currency:null});
  const routes=[...new Set(children.map(child=>{
    const destination=parsePhoneNumberFromString(child.to),origin=parsePhoneNumberFromString(child.from);
    return `${origin?.country??'Unknown'} → ${destination?.country??'Unknown'} ${destination?.getType()?.toLowerCase().replaceAll('_',' ')??'unclassified'}`;
  }))];
  // A completed browser call without its expected telephone leg may reflect
  // delayed provider discovery. Keep the known browser charge but not a final total.
  const discoveryComplete=parent.status!=='completed' || children.length>0;
  await saveCallCosts(source,accountSid!,routes.length===1 ? routes[0] : routes.length ? 'Multiple telephone routes' : discoveryComplete ? 'Browser only' : 'Telephone leg pending',resources,discoveryComplete);
}
async function syncSource(source:CostSource):Promise<boolean> {
  try{await reconcileCallCost(source);return true;}
  catch{await failCallCosts(source);return false;}
}
export async function captureCallCost(callSid:string):Promise<void> {
  for(const source of await claimCostCalls('30d',callSid))await syncSource(source);
}
async function syncStorageCost(range:CostRange):Promise<boolean> {
  try{
    const accountSid=process.env.TWILIO_ACCOUNT_SID?.trim();if(!accountSid)return false;
    const {startDate,endDate}=costPeriod(range);
    const rows=await voiceService().usage.records.list({category:'recordingstorage',startDate:new Date(startDate+'T00:00:00Z'),endDate:new Date(endDate+'T00:00:00Z'),limit:2});
    if(rows.length!==1 || rows[0].accountSid!==accountSid || rows[0].category!=='recordingstorage')return false;
    const row=rows[0],cost=providerCost(row.price,row.priceUnit),date=new Date(row.asOf);
    if(row.startDate?.toISOString().slice(0,10)!==startDate || row.endDate?.toISOString().slice(0,10)!==endDate)return false;
    if(!cost)return false;
    await saveStorageCost(range,accountSid,cost,Number.isFinite(date.getTime()) ? date.toISOString() : null);return true;
  }catch{return false;}
}
export async function syncCallCosts(range:CostRange):Promise<CostSyncResult> {
  const sources=await claimCostCalls(range);
  const [results,storageSynced]=await Promise.all([Promise.all(sources.map(syncSource)),syncStorageCost(range)]);
  return {synced:results.filter(Boolean).length,failed:results.filter(ok=>!ok).length,remaining:await dueCostCalls(range),storageSynced};
}
