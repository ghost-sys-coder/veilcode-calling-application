import 'server-only';
import {parsePhoneNumberFromString} from 'libphonenumber-js/max';
import {terminalCostResource} from '@/lib/call-cost-values';
import {draftRoutes,type DraftRoute,type RateSample,type RateObservation} from '@/lib/rate-draft-types';
import type {CostResource} from '@/lib/call-cost-types';
export interface DraftSampleCall {callSid:string;to:string;checked:boolean;complete:boolean;failed:boolean;resources:CostResource[]}
export function observedRateSample(rows:DraftSampleCall[],startDate:string,endDate:string):RateSample {
  const sample:RateSample={startDate,endDate,examined:Math.min(rows.length,100),hasMore:rows.length>100,observations:[],excluded:{incomplete:0,currency:0,route:0,duration:0}};
  for(const call of rows.slice(0,100)){
    const destination=parsePhoneNumberFromString(call.to),key=`${destination?.country}_${destination?.getType()}`;
    if(!destination?.isValid() || destination.number!==call.to || !draftRoutes.some(route=>route.key===key)){sample.excluded.route++;continue;}
    const resources=call.resources,browser=resources.filter(item=>item.kind==='browser'),telephone=resources.filter(item=>item.kind==='telephone');
    if(!call.checked || !call.complete || call.failed || browser.length!==1 || browser[0].sid!==call.callSid || telephone.length!==1 ||
      new Set(resources.map(item=>item.sid)).size!==resources.length || resources.some(item=>!terminalCostResource(item) ||
        !['browser','telephone','recording'].includes(item.kind) || !(item.kind==='recording'?/^RE[0-9a-f]{32}$/i:/^CA[0-9a-f]{32}$/i).test(item.sid) ||
        item.amountMicro===null || !Number.isSafeInteger(item.amountMicro) || item.amountMicro<0 || !item.currency)){
      sample.excluded.incomplete++;continue;
    }
    if(resources.some(item=>item.currency!=='USD')){sample.excluded.currency++;continue;}
    const seconds=telephone[0].durationSeconds,parentSeconds=browser[0].durationSeconds;
    if(seconds===null || parentSeconds===null || !Number.isInteger(seconds) || !Number.isInteger(parentSeconds) || seconds<0 || parentSeconds<seconds || parentSeconds>86400 ||
      (telephone[0].status!=='completed'&&seconds!==0) || (browser[0].status!=='completed'&&seconds!==0)){
      sample.excluded.duration++;continue;
    }
    const supplierMicro=resources.reduce((sum,item)=>sum+item.amountMicro!,0);
    if(!Number.isSafeInteger(supplierMicro)){sample.excluded.incomplete++;continue;}
    const observation:RateObservation={route:key as DraftRoute,seconds,supplierMicro,recorded:resources.some(item=>item.kind==='recording')};
    sample.observations.push(observation);
  }
  return sample;
}
