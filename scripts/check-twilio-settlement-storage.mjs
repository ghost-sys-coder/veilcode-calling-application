import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import pg from 'pg';
import {loadModule} from '../tests/support/load-typescript.mjs';
createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd());
const url=new URL(process.env.DIRECT_DATABASE_URL||process.env.DATABASE_URL);
url.hostname='ep-noisy-waterfall-b9lcv5rb.c-7.eu-central-1.aws.neon.tech';
if(url.pathname!=='/veilcall')throw new Error('Use the isolated VeilCall validation database.');
const client=new pg.Client({connectionString:url.toString(),connectionTimeoutMillis:15000,query_timeout:15000});
let sequence=0;const query=(...args)=>client.query(...args);
const database={query,connect:async()=>{const savepoint=`settlement_fixture_${++sequence}`;return {query:(sql,...args)=>query(sql==='BEGIN'?`SAVEPOINT ${savepoint}`:sql==='COMMIT'?`RELEASE SAVEPOINT ${savepoint}`:sql==='ROLLBACK'?`ROLLBACK TO SAVEPOINT ${savepoint}`:sql,...args),release:()=>{}};}};
const config=loadModule('../src/lib/billing-config.ts',{'server-only':{},'@/lib/stripe-config':{getStripeMode:()=>'test'}});
const rates=loadModule('../src/lib/billing-rates.ts',{'server-only':{},'@/lib/billing-config':config});
const access=loadModule('../src/lib/customer-access.ts',{'server-only':{},'@/lib/review-db':{reviewDatabase:()=>database},'@/lib/billing-config':config,'@/lib/access':{}});
const billing=loadModule('../src/lib/billing-store.ts',{'server-only':{},'@/lib/review-db':{reviewDatabase:()=>database},'@/lib/customer-access':access,'@/lib/billing-config':config,'@/lib/billing-rates':rates});
const evidence=loadModule('../src/lib/twilio-settlement-proof.ts',{'server-only':{}});
const store=loadModule('../src/lib/twilio-settlement-store.ts',{'server-only':{},'@/lib/review-db':{reviewDatabase:()=>database},'@/lib/customer-access':access,'@/lib/billing-config':config,'@/lib/billing-store':billing,'@/lib/twilio-settlement-proof':evidence});
const review=loadModule('../src/lib/settlement-review-store.ts',{'server-only':{},'@/lib/review-db':{reviewDatabase:()=>database},'@/lib/customer-access':access,'@/lib/billing-config':config,'@/lib/twilio-settlement-store':store});
let providerPending=false,providerReads=0;
const service=loadModule('../src/lib/twilio-settlement-service.ts',{'server-only':{},'@/lib/billing-config':config,'@/lib/operator-caller-ids':{},'@/lib/voice-service':{},
  '@/lib/billing-store':billing,'@/lib/prepaid-rules':{},'@/lib/twilio-settlement-proof':evidence,'@/lib/twilio-settlement-store':store,
  '@/lib/twilio-settlement-provider':{fetchTwilioSettlement:async(reservation,account)=>{
    providerReads++;if(providerPending)throw new evidence.SettlementEvidenceError('provider-pending');
    const proof={source:'twilio-api',accountSid:account,
      parent:{sid:reservation.callSid,accountSid:account,parentCallSid:null,from:`client:${reservation.operatorId}`,to:'',direction:'inbound',status:'completed',duration:'96'},
      child:{sid:'CA'+randomBytes(16).toString('hex'),accountSid:account,parentCallSid:reservation.callSid,from:reservation.from,to:reservation.to,direction:'outbound-dial',status:'completed',duration:'61'}};
    return {seconds:evidence.twilioSettlementSeconds(reservation,account,proof),proof};
  }},
});
const worker=loadModule('../src/lib/settlement-worker.ts',{'server-only':{},'@/lib/twilio-settlement-service':service,'@/lib/settlement-review-store':review,'@/lib/twilio-settlement-store':store});
const tag=randomBytes(8).toString('hex'),user='settlement_'+tag,accountSid='AC'+'a'.repeat(32),from='+442079460123',to='+61293744000';
const checks=[];let account;
async function fixture(mode='live',accepted=true){
  const owner=await billing.getBillingAccount(user,mode);
  await query("UPDATE veilcall_billing_accounts SET subscription_status='active',paid_until=now()+interval '1 day',blocked=false WHERE id=$1",[owner.id]);
  const quote=randomUUID(),id=randomUUID(),sid='CA'+randomBytes(16).toString('hex');
  await query(`INSERT INTO veilcall_prepaid_quotes(id,account_id,to_number,from_number,route,rate_micro,fee_micro,max_seconds,held_micro,expires_at)
    VALUES($1,$2,$3,$4,'Fixture',60000,10000,300,310000,now()+interval '45 seconds')`,[quote,owner.id,to,from]);
  await query(`INSERT INTO veilcall_call_reservations(id,account_id,to_number,from_number,route,rate_micro,fee_micro,max_seconds,held_micro,expires_at,quote_id,rate_accepted_at,rate_acceptance_version)
    VALUES($1,$2,$3,$4,'Fixture',60000,10000,300,310000,now()+interval '45 seconds',$5,$6,$7)`,[id,owner.id,to,from,quote,accepted?new Date():null,mode==='live'?'prepaid-live-v1':'prepaid-test-v1']);
  await query('UPDATE veilcall_billing_accounts SET balance_micro=1000000,held_micro=310000 WHERE id=$1',[owner.id]);
  return {id,sid,owner};
}
async function queue(id){return (await query('SELECT * FROM veilcall_twilio_settlements WHERE reservation_id=$1',[id])).rows[0];}
async function bind(f){return store.bindTwilioReservation(f.id,user,to,from,f.sid,accountSid);}
async function claim(f,advance=false){
  await store.wakeTwilioSettlement(accountSid,f.sid);
  if(advance)await query('UPDATE veilcall_twilio_settlements SET next_attempt_at=now() WHERE reservation_id=$1',[f.id]);
  return (await store.claimTwilioSettlements(f.sid))[0];
}
async function releaseUnused(f){await query("UPDATE veilcall_call_reservations SET status='released' WHERE id=$1",[f.id]);}
try{
  await client.connect();await query('BEGIN');
  const directory=new URL('../migrations/',import.meta.url),files=(await readdir(directory)).filter(file=>/^\d+_.*\.sql$/.test(file)).sort();
  for(let pass=0;pass<2;pass++)for(const file of files)await query(await readFile(new URL(file,directory),'utf8'));
  console.log(JSON.stringify({stage:'migration_verified'}));
  account=await billing.getBillingAccount(user,'live');
  const test=await fixture('test');await assert.rejects(bind(test),error=>error.status===403);await releaseUnused(test);
  const unaccepted=await fixture('live',false);await assert.rejects(bind(unaccepted),error=>error.status===403);await releaseUnused(unaccepted);
  const expired=await fixture();await query("UPDATE veilcall_call_reservations SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.id]);
  await assert.rejects(bind(expired),error=>error.status===403);await releaseUnused(expired);
  const changed=await fixture();await query('UPDATE veilcall_call_reservations SET rate_micro=1 WHERE id=$1',[changed.id]);
  await assert.rejects(bind(changed),error=>error.status===403);await releaseUnused(changed);
  const collision=await fixture();await query(`INSERT INTO veilcall_twilio_settlements(reservation_id,account_sid,parent_sid,next_attempt_at)
    VALUES($1,$2,$3,now())`,[collision.id,accountSid,'CA'+randomBytes(16).toString('hex')]);
  await assert.rejects(bind(collision),error=>error.code==='23505');
  assert.equal((await billing.getCallReservation(collision.id)).status,'reserved');assert.equal((await billing.getCallReservation(collision.id)).callSid,null);
  await releaseUnused(collision);await query("UPDATE veilcall_twilio_settlements SET state='review',reason='provider-mismatch' WHERE reservation_id=$1",[collision.id]);
  checks.push('Test credit, unaccepted/expired permits and changed quotes cannot bind to Twilio');
  checks.push('Failure to persist the recovery job rolls permit consumption back');
  const call=await fixture();await bind(call);assert.equal((await billing.getCallReservation(call.id)).status,'active');assert.equal((await queue(call.id)).parent_sid,call.sid);
  await assert.rejects(bind(call),error=>error.status===403);assert.equal((await store.claimTwilioSettlements(call.sid)).length,0);
  await store.wakeTwilioSettlement('AC'+'b'.repeat(32),call.sid);assert.equal((await store.claimTwilioSettlements(call.sid)).length,0);
  let job=await claim(call);assert.equal(job.attempts,1);assert.equal((await store.claimTwilioSettlements(call.sid)).length,0);
  checks.push('Permit consumption and provider binding are atomic; the wrong account cannot wake a job; leases exclude duplicate workers');
  console.log(JSON.stringify({stage:'binding_and_lease_verified'}));
  const stale=job;
  await query("UPDATE veilcall_twilio_settlements SET lease_until=now()-interval '1 second' WHERE reservation_id=$1",[call.id]);
  job=(await store.claimTwilioSettlements(call.sid))[0];assert.equal(job.attempts,2);assert.notEqual(job.lease,stale.lease);
  await store.finishTwilioSettlement(stale);assert.equal((await queue(call.id)).state,'pending');
  await store.deferTwilioSettlement(stale,'provider-mismatch',true);assert.equal((await queue(call.id)).state,'pending');
  await store.deferTwilioSettlement(job,'provider-pending',false);assert.equal((await store.claimTwilioSettlements(call.sid)).length,0);
  await store.wakeTwilioSettlement(accountSid,call.sid);assert.equal((await store.claimTwilioSettlements(call.sid)).length,0);
  assert.equal((await billing.getBillingAccount(user,'live')).heldMicro,310000);
  checks.push('Expired worker leases recover; stale workers cannot overwrite the new lease; unavailable provider records retain the full hold');
  job=await claim(call,true);
  await billing.settleBillingReservation(call.id,call.sid,61,'CA'+'b'.repeat(32),{source:'rollback-only-fixture'});
  await billing.settleBillingReservation(call.id,call.sid,61,'CA'+'b'.repeat(32),{source:'rollback-only-fixture'});
  assert.equal((await billing.getBillingAccount(user,'live')).balanceMicro,870000);assert.equal((await billing.getBillingAccount(user,'live')).heldMicro,0);
  assert.equal(Number((await query("SELECT count(*) FROM veilcall_billing_ledger WHERE account_id=$1 AND kind='usage'",[account.id])).rows[0].count),1);
  // Crash after debit but before marking the recovery record complete.
  await query("UPDATE veilcall_twilio_settlements SET lease_until=now()-interval '1 second' WHERE reservation_id=$1",[call.id]);
  const recovered=(await store.claimTwilioSettlements(call.sid))[0];assert.equal(recovered.reservation.status,'settled');
  await store.finishTwilioSettlement(recovered);assert.equal((await queue(call.id)).state,'done');assert.equal((await store.claimTwilioSettlements(call.sid)).length,0);
  checks.push('Repeated settlement debits once; a committed ledger with unfinished job is recoverable without charging again');
  const mismatch=await fixture();await bind(mismatch);const mismatchJob=await claim(mismatch);await store.deferTwilioSettlement(mismatchJob,'provider-mismatch',true);
  assert.equal((await queue(mismatch.id)).state,'review');await store.wakeTwilioSettlement(accountSid,mismatch.sid);assert.equal((await store.claimTwilioSettlements(mismatch.sid)).length,0);
  assert.equal((await billing.getBillingAccount(user,'live')).heldMicro,310000);
  // End this fixture explicitly so the next fixture can exercise a different call.
  await billing.settleBillingReservation(mismatch.id,mismatch.sid,0,null,{source:'rollback-only-fixture'});
  const exhausted=await fixture();await bind(exhausted);await query('UPDATE veilcall_twilio_settlements SET attempts=11 WHERE reservation_id=$1',[exhausted.id]);
  const last=await claim(exhausted,true);await store.deferTwilioSettlement(last,'provider-unavailable',false);
  assert.equal((await queue(exhausted.id)).state,'review');assert.equal((await queue(exhausted.id)).reason,'attempts-exhausted');
  checks.push('Mismatches and exhausted retries require review; callbacks cannot reset quarantine');
  await billing.settleBillingReservation(exhausted.id,exhausted.sid,301,'CA'+'c'.repeat(32),{source:'rollback-only-fixture'});
  const overrun=await billing.getBillingAccount(user,'live');assert.equal(overrun.balanceMicro,690000);assert.equal(overrun.heldMicro,0);assert.equal(overrun.blocked,true);
  checks.push('Provider overruns never exceed the accepted hold and pause further spending');
  console.log(JSON.stringify({stage:'ledger_verified'}));
  const missed=await fixture();await bind(missed);
  await query("UPDATE veilcall_twilio_settlements SET next_attempt_at=now()-interval '1 second' WHERE reservation_id=$1",[missed.id]);
  const recoveredByWorker=await worker.runSettlementWorker();assert.equal(recoveredByWorker.settled,1);
  assert.equal((await billing.getBillingAccount(user,'live')).balanceMicro,870000);assert.equal((await billing.getBillingAccount(user,'live')).heldMicro,0);
  assert.ok((await review.settlementReport()).lastAutomaticCheck);
  checks.push('The worker settles an abandoned call with no callback or browser, and records its automatic check');
  const needsReview=await fixture();await bind(needsReview);await store.deferTwilioSettlement(await claim(needsReview),'provider-mismatch',true);
  const beforeReview=await queue(needsReview.id);
  const recheck={id:needsReview.id,revision:beforeReview.revision,note:'Provider account verified after investigation.'};
  // A failed audit insert must roll back the queue transition as well.
  await assert.rejects(review.recheckSettlement('fixture_owner',{...recheck,note:'bad'}),error=>error.code==='23514');
  assert.equal((await queue(needsReview.id)).state,'review');assert.equal((await queue(needsReview.id)).revision,beforeReview.revision);
  await review.recheckSettlement('fixture_owner',recheck);
  await assert.rejects(review.recheckSettlement('other_owner',recheck),error=>error.status===409);
  const audit=await query('SELECT actor_id,note,previous_reason FROM veilcall_settlement_audit WHERE reservation_id=$1',[needsReview.id]);
  assert.equal(audit.rows.length,1);assert.equal(audit.rows[0].actor_id,'fixture_owner');assert.equal(audit.rows[0].previous_reason,'provider-mismatch');
  assert.equal((await billing.getBillingAccount(user,'live')).heldMicro,310000);
  assert.equal((await worker.runSettlementWorker()).settled,1);assert.equal((await billing.getBillingAccount(user,'live')).heldMicro,0);
  checks.push('Owner rechecks are audited atomically; stale/concurrent actions cannot recheck twice or release credit without evidence');
  const waiting=await fixture();await bind(waiting);providerPending=true;
  await query('UPDATE veilcall_twilio_settlements SET next_attempt_at=now(),attempts=11 WHERE reservation_id=$1',[waiting.id]);
  assert.equal((await worker.runSettlementWorker()).pending,1);assert.equal((await queue(waiting.id)).state,'review');
  assert.equal((await billing.getBillingAccount(user,'live')).heldMicro,310000);
  const report=await review.settlementReport();assert.ok(report.items.every(item=>item.destination.startsWith('•••• ')));assert.ok(report.items.every(item=>!item.destination.includes(to)));
  assert.ok(providerReads>=3);
  checks.push('Incomplete provider records keep the hold and surface a masked review item after retries are exhausted');
  const status=await store.twilioSettlementStatus();assert.ok(status.review>=2);assert.ok(status.done>=1);
  await query('ROLLBACK');console.log(JSON.stringify({passed:true,checks,rollback:true}));
}catch{
  await query('ROLLBACK').catch(()=>{});console.error('Provider settlement storage verification failed; all fixture changes rolled back.');process.exitCode=1;
}finally{await client.end();}
