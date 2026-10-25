import {numberOperator} from '@/lib/number-access';
import {costRange} from '@/lib/call-cost-values';
import {getCallCostReport} from '@/lib/call-cost-store';
import {syncCallCosts} from '@/lib/call-cost-service';
import {voiceJson} from '@/lib/voice-responses';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:Request) {
  const owner=await numberOperator(undefined,true);if(owner instanceof Response)return owner;
  const range=costRange(new URL(request.url).searchParams.get('range'));
  if(!range)return voiceJson({error:'Choose a supported cost period.'},400);
  try{return voiceJson(await getCallCostReport(range,owner.userId));}
  catch{return voiceJson({error:'Call costs are temporarily unavailable. Please try again.'},503);}
}
export async function POST(request:Request) {
  const owner=await numberOperator(request,true);if(owner instanceof Response)return owner;
  const range=costRange(new URL(request.url).searchParams.get('range'));
  if(!range)return voiceJson({error:'Choose a supported cost period.'},400);
  try{return voiceJson(await syncCallCosts(range));}
  catch{return voiceJson({error:'Costs could not be fully synced. Refresh the report and try again.'},503);}
}
