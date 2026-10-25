import 'server-only';
import {createRemoteJWKSet,jwtVerify} from 'jose';
const issuer='https://token.actions.githubusercontent.com';
const keys=createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks`),{timeoutDuration:5000});
const repository='ghost-sys-coder/veilcode-calling-application';
export async function githubSchedulerAuthorized(request:Request,audience:string,workflow:string):Promise<boolean> {
  const authorization=request.headers.get('authorization')??'';
  const token=request.headers.get('x-veilcall-scheduler-token') || (authorization.startsWith('Bearer ')?authorization.slice(7):'');
  if(token.length>20000 || token.split('.').length!==3)return false;
  try{
    const {payload}=await jwtVerify(token,keys,{issuer,audience,algorithms:['RS256'],maxTokenAge:'10m',clockTolerance:5,
      requiredClaims:['exp','iat','repository_id','repository_owner_id','repository','workflow_ref','ref','event_name','sub']});
    return payload.repository_id==='1414889716' && payload.repository_owner_id==='84653892' && payload.repository===repository &&
      payload.ref==='refs/heads/master' && typeof payload.sub==='string' && payload.sub.length>0 &&
      payload.workflow_ref===`${repository}/.github/workflows/${workflow}@refs/heads/master` &&
      ['schedule','workflow_dispatch','push'].includes(String(payload.event_name));
  }catch{return false;}
}
