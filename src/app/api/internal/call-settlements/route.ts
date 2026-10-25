import {githubSchedulerAuthorized} from '@/lib/github-scheduler-auth';
import {runSettlementWorker} from '@/lib/settlement-worker';
import {voiceJson} from '@/lib/voice-responses';
export const runtime='nodejs';
export const maxDuration=60;
const settlementAudience='https://call.veilcode.studio/call-settlement-recovery';
export async function GET(request:Request) {
  if(!await githubSchedulerAuthorized(request,settlementAudience,'call-settlement-recovery.yml'))return voiceJson({error:'Unauthorized.'},401);
  try{return voiceJson(await runSettlementWorker());}
  catch{console.error('Automatic call settlement recovery unavailable.');return voiceJson({error:'Settlement recovery unavailable.'},503);}
}
