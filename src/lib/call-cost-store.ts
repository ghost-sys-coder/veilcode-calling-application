import 'server-only';
import {randomUUID} from 'node:crypto';
import {reviewDatabase} from '@/lib/review-db';
import {billingTransaction} from '@/lib/customer-access';
import {costPeriod,mergeCostResources,sumCostResources,terminalCostResource} from '@/lib/call-cost-values';
import type {CostRange,CostResource,CostCall,CallCostReport} from '@/lib/call-cost-types';

export interface CostSource {callSid:string;operatorId:string;token:string}
export async function claimCostCalls(range:CostRange,callSid?:string):Promise<CostSource[]> {
  const {startDate,endDate}=costPeriod(range),token=randomUUID();
  const result=await reviewDatabase().query<CostSource>(`WITH candidates AS (
    SELECT c.call_sid FROM veilcall_calls c LEFT JOIN veilcall_call_costs p USING(call_sid)
    WHERE c.started_at >= $1::date AT TIME ZONE 'UTC' AND c.started_at < ($2::date+1) AT TIME ZONE 'UTC'
      AND ($4::text IS NULL OR c.call_sid=$4)
      AND c.status IN ('completed','failed','busy','no-answer','canceled')
      AND (p.lease_until IS NULL OR p.lease_until<now())
      AND (p.last_attempt_at IS NULL OR p.last_attempt_at<now()-interval '60 seconds')
    ORDER BY p.last_attempt_at NULLS FIRST,c.started_at DESC,c.call_sid LIMIT ${callSid ? 1 : 5}
  ), claimed AS (
    INSERT INTO veilcall_call_costs(call_sid,lease_token,lease_until,last_attempt_at)
    SELECT call_sid,$3::uuid,now()+interval '90 seconds',now() FROM candidates
    ON CONFLICT(call_sid) DO UPDATE SET lease_token=$3::uuid,lease_until=now()+interval '90 seconds',last_attempt_at=now()
      WHERE (veilcall_call_costs.lease_until IS NULL OR veilcall_call_costs.lease_until<now())
        AND (veilcall_call_costs.last_attempt_at IS NULL OR veilcall_call_costs.last_attempt_at<now()-interval '60 seconds')
    RETURNING call_sid
  ) SELECT c.call_sid AS "callSid",c.operator_id AS "operatorId",$3::text AS token
    FROM claimed JOIN veilcall_calls c USING(call_sid)`,[startDate,endDate,token,callSid??null]);
  return result.rows;
}
export async function costRecordingReferences(callSid:string):Promise<{sid:string;status:string;duration:number}[]> {
  return (await reviewDatabase().query(`SELECT recording_sid AS sid,status,duration_seconds AS duration
    FROM veilcall_recordings WHERE call_sid=$1 ORDER BY recording_sid LIMIT 101`,[callSid])).rows;
}
export async function saveCallCosts(source:CostSource,accountSid:string,route:string,incoming:CostResource[],discoveryComplete=true):Promise<void> {
  await billingTransaction(async client=>{
    const result=await client.query<{resources:CostResource[];provider_account_sid:string|null}>(`SELECT p.resources,p.provider_account_sid FROM veilcall_call_costs p
      JOIN veilcall_calls c USING(call_sid) WHERE p.call_sid=$1 AND p.lease_token=$2 AND c.operator_id=$3 FOR UPDATE OF p`,[source.callSid,source.token,source.operatorId]);
    if(!result.rows[0])throw new Error('Cost refresh lease changed.');
    const resources=mergeCostResources(result.rows[0].provider_account_sid===accountSid ? result.rows[0].resources : [],incoming);
    await client.query(`UPDATE veilcall_call_costs SET provider_account_sid=$3,route_label=$4,resources=$5::jsonb,
      checked_at=now(),discovery_complete=$6,sync_failed=false,lease_token=NULL,lease_until=NULL WHERE call_sid=$1 AND lease_token=$2`,
    [source.callSid,source.token,accountSid,route,JSON.stringify(resources),discoveryComplete]);
  });
}
export async function failCallCosts(source:CostSource):Promise<void> {
  await reviewDatabase().query(`UPDATE veilcall_call_costs SET sync_failed=true,lease_token=NULL,lease_until=NULL
    WHERE call_sid=$1 AND lease_token=$2`,[source.callSid,source.token]);
}
export async function dueCostCalls(range:CostRange):Promise<number> {
  const {startDate,endDate}=costPeriod(range);
  return Number((await reviewDatabase().query(`SELECT count(*) AS count FROM veilcall_calls c
    LEFT JOIN veilcall_call_costs p USING(call_sid)
    WHERE c.started_at >= $1::date AT TIME ZONE 'UTC' AND c.started_at < ($2::date+1) AT TIME ZONE 'UTC'
      AND c.status IN ('completed','failed','busy','no-answer','canceled')
      AND (p.lease_until IS NULL OR p.lease_until<now())
      AND (p.last_attempt_at IS NULL OR p.last_attempt_at<now()-interval '60 seconds')`,[startDate,endDate])).rows[0].count);
}
export async function saveStorageCost(range:CostRange,accountSid:string,cost:{amountMicro:number;currency:string}|null,asOf:string|null) {
  const {startDate,endDate}=costPeriod(range);
  await reviewDatabase().query(`INSERT INTO veilcall_storage_costs(provider_account_sid,start_date,end_date,amount_micro,currency,as_of)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(provider_account_sid,start_date,end_date) DO UPDATE SET
    amount_micro=EXCLUDED.amount_micro,currency=EXCLUDED.currency,as_of=EXCLUDED.as_of,checked_at=now()`,
  [accountSid,startDate,endDate,cost?.amountMicro??null,cost?.currency??null,asOf]);
}
export async function getCallCostReport(range:CostRange,viewerId:string):Promise<CallCostReport> {
  const {startDate,endDate}=costPeriod(range),accountSid=process.env.TWILIO_ACCOUNT_SID?.trim()??'';
  const [result,storage,due]=await Promise.all([
    reviewDatabase().query(`SELECT c.call_sid AS "callSid",c.to_number AS "to",c.country,c.started_at AS "startedAt",c.status,c.operator_id=$4 AS "canReview",
      c.duration_seconds AS duration,p.route_label AS route,p.checked_at AS "checkedAt",p.sync_failed AS failed,p.discovery_complete AS "discoveryComplete",
      COALESCE(p.resources,'[]'::jsonb) AS resources FROM veilcall_calls c LEFT JOIN veilcall_call_costs p
        ON p.call_sid=c.call_sid AND (p.provider_account_sid=$3 OR p.provider_account_sid IS NULL)
      WHERE c.started_at >= $1::date AT TIME ZONE 'UTC' AND c.started_at < ($2::date+1) AT TIME ZONE 'UTC'
      ORDER BY c.started_at DESC,c.call_sid DESC LIMIT 101`,[startDate,endDate,accountSid,viewerId]),
    reviewDatabase().query(`SELECT amount_micro::float8 AS "amountMicro",currency,as_of AS "asOf",checked_at AS "checkedAt"
      FROM veilcall_storage_costs WHERE provider_account_sid=$1 AND start_date=$2 AND end_date=$3`,[accountSid,startDate,endDate]),
    dueCostCalls(range),
  ]);
  const calls:CostCall[]=result.rows.slice(0,100).map(row=>{
    const resources:CostResource[]=row.resources;
    const complete=Boolean(row.checkedAt && row.discoveryComplete && resources.some(item=>item.kind==='browser') && resources.every(item=>terminalCostResource(item) && item.amountMicro!==null && item.currency));
    return {callSid:row.callSid,to:row.to,country:row.country,startedAt:new Date(row.startedAt).toISOString(),status:row.status,duration:row.duration,
      route:row.route||row.country||'Route pending',canReview:row.canReview,discoveryComplete:row.discoveryComplete??false,checkedAt:row.checkedAt ? new Date(row.checkedAt).toISOString() : null,
      state:row.failed ? 'stale' : !row.checkedAt ? 'untracked' : complete ? 'complete' : 'pending',resources,charges:sumCostResources(resources)};
  });
  const savedStorage=storage.rows[0];
  return {range,startDate,endDate,generatedAt:new Date().toISOString(),calls,totals:sumCostResources(calls.flatMap(call=>call.resources)),
    complete:calls.filter(call=>call.state==='complete').length,pending:calls.filter(call=>call.state!=='complete').length,hasMore:result.rows.length>100,due,
    storage:savedStorage ? {...savedStorage,asOf:savedStorage.asOf ? new Date(savedStorage.asOf).toISOString() : null,checkedAt:new Date(savedStorage.checkedAt).toISOString()} : null};
}
