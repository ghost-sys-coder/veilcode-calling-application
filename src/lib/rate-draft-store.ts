import 'server-only';
import {reviewDatabase} from '@/lib/review-db';
import {costPeriod} from '@/lib/call-cost-values';
import {observedRateSample,type DraftSampleCall} from '@/lib/rate-draft-sample';
import {RateDraftError} from '@/lib/rate-draft-values';
import type {CostRange} from '@/lib/call-cost-types';
import type {DraftPrices,RateDraft} from '@/lib/rate-draft-types';
const fields='revision,rates,updated_at AS "updatedAt"';
export async function readRateDraft(owner:string,account:string,from:string):Promise<RateDraft> {
  return (await reviewDatabase().query<RateDraft>(`SELECT ${fields} FROM veilcall_rate_drafts
    WHERE owner_id=$1 AND provider_account_sid=$2 AND from_number=$3`,[owner,account,from])).rows[0]??{revision:0,rates:{},updatedAt:null};
}
export async function saveRateDraft(owner:string,account:string,from:string,revision:number,rates:DraftPrices):Promise<RateDraft> {
  const result=revision===0 ? await reviewDatabase().query<RateDraft>(`INSERT INTO veilcall_rate_drafts(owner_id,provider_account_sid,from_number,revision,rates)
    VALUES($1,$2,$3,1,$4::jsonb) ON CONFLICT DO NOTHING RETURNING ${fields}`,[owner,account,from,JSON.stringify(rates)]) :
    await reviewDatabase().query<RateDraft>(`UPDATE veilcall_rate_drafts SET rates=$5::jsonb,revision=revision+1,updated_at=now()
      WHERE owner_id=$1 AND provider_account_sid=$2 AND from_number=$3 AND revision=$4 RETURNING ${fields}`,[owner,account,from,revision,JSON.stringify(rates)]);
  if(!result.rows[0])throw new RateDraftError('A newer draft was saved. Reload the saved draft before saving your changes.',409);
  return result.rows[0];
}
export async function rateDraftSample(owner:string,account:string,from:string,range:CostRange) {
  const {startDate,endDate}=costPeriod(range);
  const result=await reviewDatabase().query<DraftSampleCall>(`SELECT c.call_sid AS "callSid",c.to_number AS "to",
    p.checked_at IS NOT NULL AS checked,COALESCE(p.discovery_complete,false) AS complete,COALESCE(p.sync_failed,false) AS failed,
    COALESCE(p.resources,'[]'::jsonb) AS resources
    FROM veilcall_calls c LEFT JOIN veilcall_call_costs p ON p.call_sid=c.call_sid AND p.provider_account_sid=$2
    WHERE c.operator_id=$1 AND c.from_number=$3 AND c.started_at >= $4::date AT TIME ZONE 'UTC'
      AND c.started_at < ($5::date+1) AT TIME ZONE 'UTC'
    ORDER BY c.started_at DESC,c.call_sid DESC LIMIT 101`,[owner,account,from,startDate,endDate]);
  return observedRateSample(result.rows,startDate,endDate);
}
