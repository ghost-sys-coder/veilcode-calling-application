import {numberOperator,numberBody,numberApiError} from '@/lib/number-access';
import {costRange} from '@/lib/call-cost-values';
import {getRateDraftView,updateRateDraft} from '@/lib/rate-draft-service';
import {RateDraftError} from '@/lib/rate-draft-values';
import {voiceJson} from '@/lib/voice-responses';
export const runtime='nodejs';
function draftError(error:unknown):Response {
  return error instanceof RateDraftError ? voiceJson({error:error.message},error.status) : voiceJson({error:'Draft rates are temporarily unavailable. Please try again.'},503);
}
export async function GET(request:Request) {
  const owner=await numberOperator(undefined,true);if(owner instanceof Response)return owner;
  const url=new URL(request.url),range=costRange(url.searchParams.get('range'));
  if(!range)return voiceJson({error:'Choose a supported cost period.'},400);
  try{return voiceJson(await getRateDraftView(owner.userId,url.searchParams.get('from'),range));}catch(error){return draftError(error);}
}
export async function PUT(request:Request) {
  const owner=await numberOperator(request,true);if(owner instanceof Response)return owner;
  let body:unknown;try{body=await numberBody(request);}catch(error){return numberApiError(error);}
  try{return voiceJson({draft:await updateRateDraft(owner.userId,body)});}catch(error){return draftError(error);}
}
