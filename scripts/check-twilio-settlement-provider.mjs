// Read-only compatibility check of existing owner call metadata. This script
// imports neither the settlement service nor a ledger writer and fetches no audio.
import pg from 'pg';
import twilio from 'twilio';
import {createRequire} from 'node:module';
import {loadModule} from '../tests/support/load-typescript.mjs';
createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd());
const url=new URL(process.env.DIRECT_DATABASE_URL||process.env.DATABASE_URL);
if(url.hostname.replace('-pooler','')!=='ep-small-rice-b9lq13pd.c-7.eu-central-1.aws.neon.tech'||url.pathname!=='/veilcall')
  throw new Error('This read-only check requires the existing VeilCall call-history database.');
const accountSid=process.env.TWILIO_ACCOUNT_SID?.trim(),token=process.env.TWILIO_AUTH_TOKEN?.trim();
const owners=(process.env.CLERK_ALLOWED_USER_IDS??'').split(',').map(value=>value.trim()).filter(Boolean);
if(!accountSid||!token||!owners.length)throw new Error('Existing owner voice configuration is required.');
const evidence=loadModule('../src/lib/twilio-settlement-proof.ts',{'server-only':{}});
const provider=loadModule('../src/lib/twilio-settlement-provider.ts',{'server-only':{},'@/lib/voice-service':{voiceService:()=>twilio(accountSid,token,{timeout:10000})},'@/lib/twilio-settlement-proof':evidence});
const client=new pg.Client({connectionString:url.toString(),connectionTimeoutMillis:15000,query_timeout:15000});
try{
  await client.connect();await client.query('BEGIN READ ONLY');
  const {rows}=await client.query(`SELECT call_sid AS "callSid",operator_id AS "operatorId",from_number AS "from",to_number AS "to"
    FROM veilcall_calls WHERE operator_id=ANY($1::text[]) AND status IN ('completed','busy','failed','no-answer','canceled')
    ORDER BY (status='completed') DESC,started_at DESC LIMIT 5`,[owners]);
  const result={checked:rows.length,verified:0,pending:0,review:0,reasons:{},databaseWrites:0,ledgerWrites:0,createdCalls:0};
  for(const row of rows){
    // This is an in-memory evidence shape, not a wallet or persisted reservation.
    const candidate={...row,mode:'live',status:'active',id:'read-only',accountId:'read-only',route:'read-only',rateMicro:1,feeMicro:0,maxSeconds:300,heldMicro:1,expiresAt:''};
    try{await provider.fetchTwilioSettlement(candidate,accountSid);result.verified++;}
    catch(error){const reason=error instanceof evidence.SettlementEvidenceError?error.reason:'provider-unavailable';result.reasons[reason]=(result.reasons[reason]??0)+1;if(error.review)result.review++;else result.pending++;}
  }
  await client.query('ROLLBACK');console.log(JSON.stringify(result));
  if(!rows.length||!result.verified||result.review)process.exitCode=1;
}catch{
  await client.query('ROLLBACK').catch(()=>{});console.error('Read-only provider verification could not complete. No calls or ledger entries were created.');process.exitCode=1;
}finally{await client.end();}
