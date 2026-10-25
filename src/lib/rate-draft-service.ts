import 'server-only';
import {operatorCallerIds} from '@/lib/operator-caller-ids';
import {costPeriod} from '@/lib/call-cost-values';
import {readRateDraft,saveRateDraft,rateDraftSample} from '@/lib/rate-draft-store';
import {RateDraftError,draftSaveInput,rateCoverage} from '@/lib/rate-draft-values';
import type {CostRange} from '@/lib/call-cost-types';
import {draftRoutes,type RateDraftView} from '@/lib/rate-draft-types';
function providerAccount():string {
  const account=process.env.TWILIO_ACCOUNT_SID?.trim();
  if(!account||!/^AC[0-9a-f]{32}$/i.test(account))throw new RateDraftError('Configure the Twilio account before drafting calling rates.',503);
  return account;
}
export async function getRateDraftView(owner:string,requestedFrom:string|null,range:CostRange):Promise<RateDraftView> {
  const callers=await operatorCallerIds(owner),from=requestedFrom??callers[0]?.number??'';
  if(!from&&!callers.length){const period=costPeriod(range);return {callers,from,range,draft:{revision:0,rates:{},updatedAt:null},
    sample:{...period,examined:0,hasMore:false,observations:[],excluded:{incomplete:0,currency:0,route:0,duration:0}}};}
  if(!callers.some(caller=>caller.number===from))throw new RateDraftError('Select one of your own active calling numbers.',403);
  const account=providerAccount();
  const [draft,sample]=await Promise.all([readRateDraft(owner,account,from),rateDraftSample(owner,account,from,range)]);
  for(const {key} of draftRoutes)rateCoverage(sample.observations,key,undefined);
  return {callers,from,range,draft,sample};
}
export async function updateRateDraft(owner:string,body:unknown) {
  const input=draftSaveInput(body);
  if(!(await operatorCallerIds(owner)).some(caller=>caller.number===input.from))throw new RateDraftError('Select one of your own active calling numbers.',403);
  return saveRateDraft(owner,providerAccount(),input.from,input.revision,input.rates);
}
