import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import pg from 'pg';
createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd());
const mode=process.argv[2],hosts={validation:'ep-noisy-waterfall-b9lcv5rb.c-7.eu-central-1.aws.neon.tech',production:'ep-small-rice-b9lq13pd.c-7.eu-central-1.aws.neon.tech'};
if(!Object.hasOwn(hosts,mode))throw new Error('Choose validation or production explicitly.');
const target=new URL(process.env.DIRECT_DATABASE_URL||process.env.DATABASE_URL);
if(!Object.values(hosts).includes(target.hostname)||target.pathname!=='/veilcall')throw new Error('The source connection must be the existing VeilCall database.');
target.hostname=hosts[mode];
const client=new pg.Client({connectionString:target.toString(),connectionTimeoutMillis:15000,query_timeout:15000});
const moneySnapshot=()=>client.query(`SELECT count(*)::text AS accounts,COALESCE(sum(balance_micro),0)::text AS balance,
  COALESCE(sum(held_micro),0)::text AS held FROM veilcall_billing_accounts`);
try{
  await client.connect();await client.query('BEGIN');
  // Prevent concurrent billing changes only for the brief schema/verification window.
  await client.query('SET LOCAL lock_timeout=\'5s\'');
  await client.query('LOCK TABLE veilcall_billing_accounts IN SHARE MODE');
  const before=(await moneySnapshot()).rows;
  await client.query(await readFile(new URL('../migrations/013_pilot_release.sql',import.meta.url),'utf8'));
  assert.deepEqual((await moneySnapshot()).rows,before);
  const control=(await client.query('SELECT active_id,paused FROM veilcall_pilot_control WHERE singleton=true')).rows[0];
  assert.equal(control.active_id,null);assert.equal(control.paused,true);
  await client.query('COMMIT');console.log(JSON.stringify({schemaReady:true,target:mode,balancesUnchanged:true,commerceClosed:true}));
}catch(error){await client.query('ROLLBACK').catch(()=>{});console.error(JSON.stringify({schemaReady:false,target:mode,code:error.code??null}));process.exitCode=1;}
finally{await client.end();}
