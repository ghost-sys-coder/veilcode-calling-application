import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import pg from 'pg';
import {loadModule} from '../tests/support/load-typescript.mjs';
createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd());
const url=new URL(process.env.DIRECT_DATABASE_URL||process.env.DATABASE_URL);
url.hostname='ep-noisy-waterfall-b9lcv5rb.c-7.eu-central-1.aws.neon.tech';
if(url.pathname!=='/veilcall')throw new Error('Use the isolated VeilCall validation database.');
const client=new pg.Client({connectionString:url.toString(),connectionTimeoutMillis:15000,query_timeout:15000});
let tail=Promise.resolve();const database={query:(...args)=>{const next=tail.then(()=>client.query(...args));tail=next.catch(()=>{});return next;}};
const types=loadModule('../src/lib/rate-draft-types.ts');
const values=loadModule('../src/lib/rate-draft-values.ts',{'@/lib/rate-draft-types':types});
const costs=loadModule('../src/lib/call-cost-values.ts',{'@/lib/call-cost-types':loadModule('../src/lib/call-cost-types.ts')});
const samples=loadModule('../src/lib/rate-draft-sample.ts',{'server-only':{},'@/lib/call-cost-values':costs,'@/lib/rate-draft-types':types});
const store=loadModule('../src/lib/rate-draft-store.ts',{'server-only':{},'@/lib/review-db':{reviewDatabase:()=>database},'@/lib/call-cost-values':costs,'@/lib/rate-draft-sample':samples,'@/lib/rate-draft-values':values});
const tag=randomBytes(8).toString('hex'),owner='rate_draft_'+tag,account='AC'+randomBytes(16).toString('hex'),otherAccount='AC'+randomBytes(16).toString('hex');
const from='+442079460124',otherFrom='+442079460125',price={GB_FIXED_LINE:{rateMicro:20000,feeMicro:10000}};
const sid=prefix=>prefix+randomBytes(16).toString('hex');const query=(...args)=>database.query(...args);let phase='migration';
async function call({caller=from,operator=owner,provider=account,currency='USD',missing=false,busy=false,old=false}={}){
  const parent=sid('CA'),child=sid('CA');
  await query(`INSERT INTO veilcall_calls(call_sid,operator_id,to_number,from_number,country,status,duration_seconds,started_at)
    VALUES($1,$2,'+442079460123',$3,'GB',$4,$5,now()-make_interval(days=>$6))`,[parent,operator,caller,busy?'busy':'completed',busy?0:61,old?100:0]);
  const resource=(sid,kind,cost,seconds,status='completed',unit='USD')=>({sid,kind,amountMicro:cost,currency:unit,durationSeconds:seconds,status});
  const resources=[resource(parent,'browser',busy?4000:8000,busy?5:96),resource(child,'telephone',missing?null:busy?0:31600,busy?0:61,busy?'busy':'completed',currency)];
  if(!busy)resources.push(resource(sid('RE'),'recording',2500,61));
  await query(`INSERT INTO veilcall_call_costs(call_sid,provider_account_sid,resources,discovery_complete,checked_at)
    VALUES($1,$2,$3::jsonb,true,now())`,[parent,provider,JSON.stringify(resources)]);
}
try{
  await client.connect();await query('BEGIN');
  for(let pass=0;pass<2;pass++)for(const name of ['001_call_reviews.sql','008_call_costs.sql','012_rate_drafts.sql'])await query(await readFile(new URL('../migrations/'+name,import.meta.url),'utf8'));
  console.log(JSON.stringify({stage:'migration_verified'}));phase='draft_concurrency';
  assert.equal((await store.readRateDraft(owner,account,from)).revision,0);
  const first=await store.saveRateDraft(owner,account,from,0,price);assert.equal(first.revision,1);assert.deepEqual(first.rates,price);
  await assert.rejects(store.saveRateDraft(owner,account,from,0,price),error=>error.status===409);
  const changed={GB_FIXED_LINE:{rateMicro:30000,feeMicro:0}};
  assert.equal((await store.saveRateDraft(owner,account,from,1,changed)).revision,2);
  await assert.rejects(store.saveRateDraft(owner,account,from,1,price),error=>error.status===409);
  assert.deepEqual((await store.readRateDraft(owner,account,from)).rates,changed);
  for(const keys of [[owner,account,otherFrom],[owner,otherAccount,from],[owner+'_other',account,from]])assert.equal((await store.readRateDraft(...keys)).revision,0);
  await assert.rejects(store.saveRateDraft(owner,account,otherFrom,1,price),error=>error.status===409);
  const cleared=await store.saveRateDraft(owner,account,from,2,{});assert.equal(cleared.revision,3);assert.deepEqual(cleared.rates,{});
  console.log(JSON.stringify({stage:'draft_isolation_and_versions_verified'}));phase='samples';
  await call();await call({busy:true});await call({currency:'GBP'});await call({missing:true});await call({provider:otherAccount});
  await call({caller:otherFrom});await call({operator:owner+'_other'});await call({old:true});
  const sample=await store.rateDraftSample(owner,account,from,'30d');
  assert.equal(sample.examined,5);assert.equal(sample.observations.length,2);assert.equal(sample.excluded.incomplete,2);assert.equal(sample.excluded.currency,1);
  const coverage=values.rateCoverage(sample.observations,'GB_FIXED_LINE',price.GB_FIXED_LINE);
  assert.equal(coverage.supplierMicro,46100);assert.equal(coverage.revenueMicro,60000);assert.equal(coverage.differenceMicro,13900);
  const losses=values.rateCoverage(sample.observations,'GB_FIXED_LINE',{rateMicro:20000,feeMicro:0});assert.equal(losses.losingCalls,2);assert.equal(losses.uncoveredAttempts,1);
  phase='bounds';
  await query(`INSERT INTO veilcall_calls(call_sid,operator_id,to_number,from_number,country,status,started_at)
    SELECT 'CA'||md5($1||g::text),$2,'+442079460123',$3,'GB','completed',now() FROM generate_series(1,101) g`,[tag,owner,otherFrom]);
  const bounded=await store.rateDraftSample(owner,account,otherFrom,'30d');assert.equal(bounded.examined,100);assert.equal(bounded.hasMore,true);
  await query('ROLLBACK');console.log(JSON.stringify({verified:true,checks:['Additive migration applies twice','First save and concurrent edit revisions','Caller, owner and provider account isolation','Canonical per-call rounding and attempt cost checks','Missing and non-USD costs excluded','Reporting date and 100-call sample bounds'],allWritesRolledBack:true,twilioRequests:0,billingWrites:0}));
}catch(error){await client.query('ROLLBACK').catch(()=>{});console.error(JSON.stringify({verified:false,phase,errorCode:error.code??null,errorName:error.name}));process.exitCode=1;}
finally{await client.end();}
