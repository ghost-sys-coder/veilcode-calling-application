import {draftRoutes,type DraftRoute,type DraftPrices,type DraftPrice,type RateObservation} from '@/lib/rate-draft-types';
export class RateDraftError extends Error {constructor(message:string,public status=400){super(message);}}
export function draftDollarMicro(value:unknown,allowZero=false):number {
  if(typeof value!=='string' || !/^(0|[1-9]\d{0,2})(?:\.\d{1,6})?$/.test(value))throw new RateDraftError('Enter USD amounts with up to six decimal places.');
  const [whole,fraction='']=value.split('.'),micro=Number(whole)*1000000+Number(fraction.padEnd(6,'0'));
  if(micro>100000000 || (!allowZero&&micro===0))throw new RateDraftError('Use a per-minute rate above $0 and amounts no higher than $100.');
  return micro;
}
export function draftDollarText(micro:number):string {return (micro/1000000).toFixed(6).replace(/\.?0+$/,'');}
export function draftSaveInput(value:unknown):{from:string;revision:number;rates:DraftPrices} {
  const body=value as Record<string,unknown>|null;
  if(!body || Array.isArray(body) || Object.keys(body).some(key=>!['from','revision','rates'].includes(key)) ||
    typeof body.from!=='string' || !/^\+[1-9]\d{7,14}$/.test(body.from) || typeof body.revision!=='number' || !Number.isSafeInteger(body.revision) || body.revision<0 || body.revision>2147483646 ||
    !body.rates || typeof body.rates!=='object' || Array.isArray(body.rates))throw new RateDraftError('Choose a calling number and a valid draft.');
  const rates:DraftPrices={};
  for(const [key,value] of Object.entries(body.rates)){
    if(!draftRoutes.some(route=>route.key===key) || !value || typeof value!=='object' || Array.isArray(value) ||
      Object.keys(value).some(field=>!['perMinute','attempt'].includes(field)))throw new RateDraftError('Use only the four supported draft routes.');
    const row=value as Record<string,unknown>;
    rates[key as DraftRoute]={rateMicro:draftDollarMicro(row.perMinute),feeMicro:draftDollarMicro(row.attempt,true)};
  }
  return {from:body.from,revision:body.revision,rates};
}
export function rateCoverage(observations:RateObservation[],route:DraftRoute,price:DraftPrice|undefined) {
  const sample=observations.filter(item=>item.route===route);
  const supplierMicro=sample.reduce((sum,item)=>sum+item.supplierMicro,0);
  if(!Number.isSafeInteger(supplierMicro))throw new RateDraftError('The observed cost total exceeds supported precision.',503);
  if(!price)return {calls:sample.length,recorded:sample.filter(item=>item.recorded).length,supplierMicro,revenueMicro:null,differenceMicro:null,losingCalls:null,uncoveredAttempts:null,minimumRateMicro:null};
  let revenueMicro=0,losingCalls=0,uncoveredAttempts=0,minimumRateMicro:number|null=null;
  for(const item of sample){
    const minutes=Math.ceil(item.seconds/60),charge=price.feeMicro+minutes*price.rateMicro;
    revenueMicro+=charge;if(charge<item.supplierMicro)losingCalls++;
    if(!minutes){if(price.feeMicro<item.supplierMicro)uncoveredAttempts++;}
    else minimumRateMicro=Math.max(minimumRateMicro??0,Math.max(0,Math.ceil((item.supplierMicro-price.feeMicro)/minutes)));
  }
  return {calls:sample.length,recorded:sample.filter(item=>item.recorded).length,supplierMicro,revenueMicro,differenceMicro:revenueMicro-supplierMicro,losingCalls,uncoveredAttempts,minimumRateMicro};
}
