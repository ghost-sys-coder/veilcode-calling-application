import 'server-only';
import {randomUUID} from 'node:crypto';
import {reviewDatabase} from '@/lib/review-db';
import {billingTransaction} from '@/lib/customer-access';
import {BillingError} from '@/lib/billing-config';
import type {PilotOffer,PilotControl,PilotRelease} from '@/lib/pilot-types';
import {policyDocuments,policyEdition,policySections} from '@/lib/legal-policies';

const controlSql=`SELECT c.revision,c.paused,
  CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object('id',d.id,'config',d.config,'createdAt',d.created_at,'providerAccountSid',d.provider_account_sid,'policySnapshot',d.policy_snapshot) END AS draft,
  CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object('id',a.id,'config',a.config,'createdAt',a.created_at,'providerAccountSid',a.provider_account_sid,'policySnapshot',a.policy_snapshot) END AS active
  FROM veilcall_pilot_control c LEFT JOIN veilcall_pilot_offers d ON d.id=c.draft_id
  LEFT JOIN veilcall_pilot_offers a ON a.id=c.active_id WHERE c.singleton=true`;
export async function pilotControl():Promise<PilotControl>{
  const row=(await reviewDatabase().query<PilotControl>(controlSql)).rows[0];
  if(!row)throw new BillingError('Pilot release storage is not ready.',503);return row;
}
export async function pilotRelease(id:string):Promise<PilotRelease|null>{
  return (await reviewDatabase().query<PilotRelease>(`SELECT id,config,created_at::text AS "createdAt",provider_account_sid AS "providerAccountSid",policy_snapshot AS "policySnapshot" FROM veilcall_pilot_offers WHERE id=$1`,[id])).rows[0]??null;
}
export async function stagePilotOffer(actorId:string,revision:number,config:PilotOffer):Promise<void>{
  await billingTransaction(async client=>{
    const current=await client.query('SELECT revision FROM veilcall_pilot_control WHERE singleton=true FOR UPDATE');
    if(current.rows[0]?.revision!==revision)throw new BillingError('Pilot setup changed. Refresh before saving.',409);
    const id=randomUUID();
    const snapshot={edition:policyEdition,documents:Object.fromEntries(policyDocuments.map(document=>[document.key,policySections(document.key,config)]))};
    await client.query('INSERT INTO veilcall_pilot_offers(id,actor_id,config,provider_account_sid,policy_snapshot) VALUES($1,$2,$3::jsonb,$4,$5::jsonb)',[id,actorId,JSON.stringify(config),process.env.TWILIO_ACCOUNT_SID?.trim(),JSON.stringify(snapshot)]);
    await client.query('UPDATE veilcall_pilot_control SET draft_id=$1,revision=revision+1,updated_at=now() WHERE singleton=true',[id]);
    await client.query("INSERT INTO veilcall_pilot_audit(id,actor_id,action,offer_id) VALUES($1,$2,'stage',$3)",[randomUUID(),actorId,id]);
  });
}
export async function changePilotState(actorId:string,revision:number,action:'activate'|'pause',offerId:string|null):Promise<void>{
  await billingTransaction(async client=>{
    const row=(await client.query('SELECT revision,draft_id FROM veilcall_pilot_control WHERE singleton=true FOR UPDATE')).rows[0];
    if(row?.revision!==revision||(action==='activate'&&row.draft_id!==offerId))throw new BillingError('Pilot setup changed. Refresh before continuing.',409);
    await client.query(`UPDATE veilcall_pilot_control SET paused=$1,active_id=CASE WHEN $1 THEN active_id ELSE $2 END,
      revision=revision+1,updated_at=now() WHERE singleton=true`,[action==='pause',offerId]);
    await client.query('INSERT INTO veilcall_pilot_audit(id,actor_id,action,offer_id) VALUES($1,$2,$3,$4)',[randomUUID(),actorId,action,offerId]);
  });
}
export async function policiesAccepted(operatorId:string,offerId:string):Promise<boolean>{
  return Boolean((await reviewDatabase().query('SELECT 1 FROM veilcall_policy_acceptances WHERE operator_id=$1 AND offer_id=$2',[operatorId,offerId])).rowCount);
}
export async function policyServiceReady(operatorId:string,offerId:string):Promise<boolean>{
  return Boolean((await reviewDatabase().query(`SELECT 1 FROM veilcall_policy_acceptances WHERE operator_id=$1 AND offer_id=$2
    AND (immediate_service_requested OR accepted_at<=now()-interval '14 days')`,[operatorId,offerId])).rowCount);
}
export async function publiclyReleasedOffer(id:string):Promise<PilotRelease|null>{
  return (await reviewDatabase().query<PilotRelease>(`SELECT o.id,o.config,o.created_at::text AS "createdAt",o.provider_account_sid AS "providerAccountSid",o.policy_snapshot AS "policySnapshot" FROM veilcall_pilot_offers o
    WHERE o.id=$1 AND EXISTS(SELECT 1 FROM veilcall_pilot_audit a WHERE a.offer_id=o.id AND a.action='activate')`,[id])).rows[0]??null;
}
export async function acceptPolicies(operatorId:string,offerId:string,immediate:boolean):Promise<void>{
  await billingTransaction(async client=>{
    const current=(await client.query('SELECT active_id,paused FROM veilcall_pilot_control WHERE singleton=true FOR SHARE')).rows[0];
    if(current?.paused||current.active_id!==offerId)throw new BillingError('The offer changed. Review the current policies before continuing.',409);
    // Replaying acceptance never changes the original request or its timestamp.
    await client.query('INSERT INTO veilcall_policy_acceptances(operator_id,offer_id,immediate_service_requested) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[operatorId,offerId,immediate]);
  });
}
