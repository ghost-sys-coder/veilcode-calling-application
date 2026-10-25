import {BillingError} from '@/lib/billing-config';
import {draftRoutes,type DraftPrices} from '@/lib/rate-draft-types';
import type {PilotOffer} from '@/lib/pilot-types';
function record(value:unknown):value is Record<string,unknown>{return Boolean(value&&typeof value==='object'&&!Array.isArray(value));}
function keys(value:Record<string,unknown>,allowed:string[]){if(Object.keys(value).some(key=>!allowed.includes(key)))throw new BillingError('Unexpected pilot configuration field.');}
function policyUrl(value:unknown):string {
  if(value==='')return '';
  if(typeof value!=='string'||value.length>500)throw new BillingError('Enter a valid HTTPS policy address.');
  let url:URL;try{url=new URL(value);}catch{throw new BillingError('Enter a valid HTTPS policy address.');}
  if(url.protocol!=='https:'||url.username||url.password||url.hash)throw new BillingError('Enter a valid HTTPS policy address.');
  return url.toString();
}
export function pilotOfferInput(value:unknown):PilotOffer {
  if(!record(value))throw new BillingError('Enter the pilot offer details.');
  keys(value,['monthlyCents','topups','priceId','policies','taxReviewed','policiesApproved','rates','operator']);
  const {monthlyCents,topups,priceId,policies,taxReviewed,policiesApproved,rates,operator}=value;
  if(monthlyCents!==null&&(!Number.isSafeInteger(monthlyCents)||Number(monthlyCents)<100||Number(monthlyCents)>100000))throw new BillingError('Monthly price must be $1–$1,000, or left undecided.');
  if(!Array.isArray(topups)||topups.length>5||topups.some(n=>!Number.isSafeInteger(n)||n<100||n>100000)||new Set(topups).size!==topups.length)throw new BillingError('Use up to five different credit amounts, from $1–$1,000.');
  if(typeof priceId!=='string'||(priceId!==''&&!/^price_[A-Za-z0-9]{4,100}$/.test(priceId)))throw new BillingError('Enter the live monthly Stripe Price ID, or leave it blank.');
  if(!record(policies))throw new BillingError('Enter the approved policy addresses.');
  keys(policies,['terms','privacy','recording','credit','revision']);
  if(typeof policies.revision!=='string'||policies.revision.length>80||typeof taxReviewed!=='boolean'||typeof policiesApproved!=='boolean')throw new BillingError('Enter a policy revision and review decisions.');
  if(!record(operator))throw new BillingError('Enter the service operator details.');
  keys(operator,['name','country','address','email']);
  for(const key of ['name','country','address','email'])if(typeof operator[key]!=='string'||String(operator[key]).length>500)throw new BillingError('Enter valid service operator details.');
  if(operator.email!==''&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(operator.email)))throw new BillingError('Enter a valid support/privacy email.');
  if(!record(rates)||Object.keys(rates).length>30)throw new BillingError('Use at most 30 approved calling numbers.');
  const parsedRates:Record<string,DraftPrices>={};
  for(const [from,prices] of Object.entries(rates)){
    if(!/^\+[1-9]\d{7,14}$/.test(from)||!record(prices))throw new BillingError('Choose a valid calling number for each rate.');
    const parsed:DraftPrices={};
    for(const [route,price] of Object.entries(prices)){
      if(!draftRoutes.some(row=>row.key===route)||!record(price))throw new BillingError('Only ordinary UK/Australia landline and mobile routes are supported.');
      keys(price,['rateMicro','feeMicro']);
      if(!Number.isSafeInteger(price.rateMicro)||Number(price.rateMicro)<=0||Number(price.rateMicro)>100000000||!Number.isSafeInteger(price.feeMicro)||Number(price.feeMicro)<0||Number(price.feeMicro)>100000000)throw new BillingError('Use valid USD route rates.');
      parsed[route as keyof DraftPrices]={rateMicro:Number(price.rateMicro),feeMicro:Number(price.feeMicro)};
    }
    if(Object.keys(parsed).length)parsedRates[from]=parsed;
  }
  return {monthlyCents:monthlyCents as number|null,topups:[...topups].sort((a,b)=>a-b),priceId,
    policies:{terms:policyUrl(policies.terms),privacy:policyUrl(policies.privacy),recording:policyUrl(policies.recording),credit:policyUrl(policies.credit),revision:policies.revision.trim()},taxReviewed,policiesApproved,
    operator:{name:String(operator.name).trim(),country:String(operator.country).trim(),address:String(operator.address).trim(),email:String(operator.email).trim()},rates:parsedRates};
}
export function pilotOfferIssues(offer:PilotOffer):string[] {
  const issues:string[]=[];
  if(offer.monthlyCents===null)issues.push('Approve a monthly USD price.');
  if(!offer.priceId)issues.push('Configure the matching live Stripe monthly Price.');
  if(!offer.topups.length)issues.push('Approve calling-credit purchase amounts.');
  if(!offer.policies.revision||!offer.policies.terms||!offer.policies.privacy||!offer.policies.recording||!offer.policies.credit)issues.push('Add approved terms, privacy, recording and credit/refund policies with a revision.');
  if(!offer.taxReviewed)issues.push('Confirm the tax treatment with your business adviser.');
  if(!offer.policiesApproved)issues.push('Review and approve the policy wording for your business before publication.');
  if(Object.values(offer.operator).some(value=>!value))issues.push('Identify the service operator, business country, address and support/privacy email.');
  if(!Object.values(offer.rates).some(rates=>Object.keys(rates).length))issues.push('Approve at least one caller-specific UK/Australia rate.');
  return issues;
}
