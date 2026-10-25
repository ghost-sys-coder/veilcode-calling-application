import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {loadModule} from '../tests/support/load-typescript.mjs';
createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd());
const url=new URL(process.env.DIRECT_DATABASE_URL||process.env.DATABASE_URL);
url.hostname='ep-noisy-waterfall-b9lcv5rb.c-7.eu-central-1.aws.neon.tech';
if(url.pathname!=='/veilcall')throw new Error('Use the existing validation database.');
const client=new pg.Client({connectionString:url.toString(),connectionTimeoutMillis:15000,query_timeout:15000});
const types=loadModule('../src/lib/call-cost-types.ts');
const values=loadModule('../src/lib/call-cost-values.ts',{'@/lib/call-cost-types':types});
const store=loadModule('../src/lib/call-cost-store.ts',{'server-only':{},'@/lib/review-db':{reviewDatabase:()=>client},'@/lib/customer-access':{billingTransaction:run=>run(client)},'@/lib/call-cost-values':values});
const sid=prefix=>prefix+randomBytes(16).toString('hex'),callSid=sid('CA'),childSid=sid('CA'),recordingSid=sid('RE'),otherSid=sid('CA'),oldSid=sid('CA');
const user='cost_storage_'+randomBytes(8).toString('hex'),accountSid=sid('AC'),oldAccount=process.env.TWILIO_ACCOUNT_SID;
process.env.TWILIO_ACCOUNT_SID=accountSid;
const entry=(sid,kind,amountMicro,currency='USD',status='completed')=>({sid,kind,status,durationSeconds:61,amountMicro,currency:amountMicro===null?null:currency});
try{
 await client.connect();await client.query('BEGIN');
 await client.query(await readFile(new URL('../migrations/008_call_costs.sql',import.meta.url),'utf8'));
 await client.query(await readFile(new URL('../migrations/008_call_costs.sql',import.meta.url),'utf8'));
 await client.query(`INSERT INTO veilcall_calls(call_sid,operator_id,to_number,from_number,country,status,duration_seconds,started_at)
   VALUES($1,$2,'+442079460123','+442079460124','GB','completed',61,now()),
   ($3,$4,'+61293744000','+442079460124','AU','completed',60,now()),
   ($5,$2,'+442079460125','+442079460124','GB','completed',60,now()-interval '100 days')`,[callSid,user,otherSid,user+'_other',oldSid]);
 const [claim]=await store.claimCostCalls('30d',callSid);assert.ok(claim);assert.equal(claim.operatorId,user);
 assert.deepEqual(await store.claimCostCalls('30d',callSid),[],'an existing lease prevents duplicate work');
 assert.deepEqual(await store.claimCostCalls('30d',oldSid),[],'expired period is excluded');
 await store.saveCallCosts(claim,accountSid,'GB → GB fixed line',[entry(callSid,'browser',8000),entry(childSid,'telephone',31600),entry(recordingSid,'recording',2500)]);
 let report=await store.getCallCostReport('30d',user),call=report.calls.find(call=>call.callSid===callSid);
 assert.equal(call.state,'complete');assert.equal(call.charges[0].totalMicro,42100);assert.equal(call.canReview,true);
 assert.equal(report.calls.find(call=>call.callSid===otherSid).canReview,false);
 assert.equal(report.calls.find(call=>call.callSid===oldSid),undefined);
 assert.deepEqual(await store.claimCostCalls('30d',callSid),[],'a completed refresh has a one-minute cooldown');
 await client.query("UPDATE veilcall_call_costs SET last_attempt_at=now()-interval '2 minutes' WHERE call_sid=$1",[callSid]);
 const [again]=await store.claimCostCalls('30d',callSid);
 await store.saveCallCosts(again,accountSid,'GB → GB fixed line',[entry(callSid,'browser',null,null,'in-progress'),entry(recordingSid,'recording',null,null,'deleted')]);
 call=(await store.getCallCostReport('30d',user)).calls.find(call=>call.callSid===callSid);
 assert.equal(call.state,'complete');assert.equal(call.charges[0].totalMicro,42100,'deleted recordings and temporarily missing prices retain known costs');
 await assert.rejects(store.saveCallCosts(claim,accountSid,'bad',[]),'a stale lease cannot overwrite the saved snapshot');
 await client.query("UPDATE veilcall_call_costs SET last_attempt_at=now()-interval '2 minutes' WHERE call_sid=$1",[callSid]);
 const [failed]=await store.claimCostCalls('30d',callSid);await store.failCallCosts(failed);
 call=(await store.getCallCostReport('30d',user)).calls.find(call=>call.callSid===callSid);
 assert.equal(call.state,'stale');assert.equal(call.charges[0].totalMicro,42100);
 const [foreign]=await store.claimCostCalls('30d',otherSid);
 await store.saveCallCosts(foreign,accountSid,'GB → AU mobile',[entry(otherSid,'browser',0),entry(sid('CA'),'telephone',10000,'GBP'),entry(sid('RE'),'recording',null)]);
 report=await store.getCallCostReport('30d',user);const pending=report.calls.find(call=>call.callSid===otherSid);
 assert.equal(pending.state,'pending');assert.equal(pending.charges.length,2);assert.ok(report.totals.some(row=>row.currency==='GBP'));
 await store.saveStorageCost('30d',accountSid,{amountMicro:500,currency:'USD'},new Date().toISOString());
 report=await store.getCallCostReport('30d',user);assert.equal(report.storage.amountMicro,500);
 assert.equal(report.totals.find(row=>row.currency==='USD').totalMicro,42100,'account storage is never added to the call sample');
 const fakeAccount=sid('AC');await store.saveStorageCost('30d',fakeAccount,{amountMicro:999999,currency:'USD'},null);
 assert.equal((await store.getCallCostReport('30d',user)).storage.amountMicro,500,'storage is scoped to the configured provider account');
 console.log(JSON.stringify({verified:true,checks:['Idempotent additive migration','Provider refresh leases and cooldown','Date range boundaries','Exact per-resource charges and mixed currencies','Known prices retained after audio deletion or failed sync','Stale lease rejection','Unpriced resources remain pending','Call review ownership preserved','Account storage kept separate and account-scoped'],allWritesRolledBack:true}));
}catch(error){console.log(JSON.stringify({verified:false,errorCode:error.code,errorName:error.name,assertion:error.name==='AssertionError' ? error.message : undefined}));process.exitCode=1;}
finally{await client.query('ROLLBACK').catch(()=>{});await client.end();if(oldAccount===undefined)delete process.env.TWILIO_ACCOUNT_SID;else process.env.TWILIO_ACCOUNT_SID=oldAccount;}
