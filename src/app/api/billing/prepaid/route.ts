import {billingOperator,billingBody,billingApiError} from '@/lib/billing-auth';
import {BillingError} from '@/lib/billing-config';
import {requirePrepaidOperator,prepaidView,previewPrepaidRate,acceptPrepaidRate,startPrepaidRun,settlePrepaidRun,recoverPrepaidRun,cancelPrepaidTest} from '@/lib/prepaid-service';
import {voiceJson} from '@/lib/voice-responses';
export const runtime='nodejs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fields:Record<string,string[]>={quote:['action','to','from'],reserve:['action','quoteId','consent'],start:['action','id','scenario','seconds'],complete:['action','id'],cancel:['action','id'],recover:['action']};
export async function GET(){
  const operator=await billingOperator();if(operator instanceof Response)return operator;
  try{await requirePrepaidOperator(operator.userId);return voiceJson({view:await prepaidView(operator.userId)});}
  catch(error){return billingApiError(error);}
}
export async function POST(request:Request){
  const operator=await billingOperator(request);if(operator instanceof Response)return operator;
  try{
    await requirePrepaidOperator(operator.userId);
    const body=await billingBody(request) as Record<string,unknown>|null;
    if(!body || typeof body.action!=='string' || !Object.hasOwn(fields,body.action) || Object.keys(body).some(key=>!fields[body.action as string].includes(key)))
      throw new BillingError('Choose a valid prepaid test action.');
    if(['start','complete','cancel'].includes(body.action) && (typeof body.id!=='string' || !uuid.test(body.id)))throw new BillingError('Choose a valid test call.');
    if(body.action==='reserve' && (typeof body.quoteId!=='string' || !uuid.test(body.quoteId)))throw new BillingError('Preview a valid rate quote first.');
    if(body.action==='quote' && (typeof body.to!=='string' || body.to.length>30 || typeof body.from!=='string' || body.from.length>30))throw new BillingError('Choose a calling number and destination.');
    // Recovery is monotonic and independently committed, so an expired permit
    // releases its hold even if the following quote or start request is rejected.
    await recoverPrepaidRun(operator.userId);
    let quote;
    if(body.action==='quote')quote=await previewPrepaidRate(operator.userId,body.to as string,body.from as string);
    else if(body.action==='reserve')await acceptPrepaidRate(operator.userId,body.quoteId as string,body.consent);
    else if(body.action==='start')await startPrepaidRun(operator.userId,body.id as string,body.scenario,body.seconds);
    else if(body.action==='complete')await settlePrepaidRun(operator.userId,body.id as string,true);
    else if(body.action==='cancel')await cancelPrepaidTest(operator.userId,body.id as string);
    return voiceJson({view:await prepaidView(operator.userId),...(quote ? {quote} : {})});
  }catch(error){return billingApiError(error);}
}
