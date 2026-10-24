import "server-only";
import { timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
const issuer="https://token.actions.githubusercontent.com";
const keys=createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks`),{timeoutDuration:5000});
const repository="ghost-sys-coder/veilcode-calling-application";
export const emailDispatchAudience="https://call.veilcode.studio/callback-email-dispatch";

export async function emailDispatchAuthorized(request:Request):Promise<boolean> {
  const authorization=request.headers.get("authorization") || "";
  const secret=process.env.CRON_SECRET;
  if(secret){const expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(authorization);if(actual.length===expected.length && timingSafeEqual(expected,actual))return true;}
  // Clerk owns the Authorization session header. Keep scheduler identity in a
  // separate header so middleware does not interpret a GitHub JWT as a session.
  const token=request.headers.get("x-veilcall-scheduler-token") || (authorization.startsWith("Bearer ") ? authorization.slice(7) : "");
  if(token.length>20000 || token.split(".").length!==3)return false;
  try {
    const {payload}=await jwtVerify(token,keys,{issuer,audience:emailDispatchAudience,algorithms:["RS256"],maxTokenAge:"10m",clockTolerance:5,requiredClaims:["exp","iat","repository_id","repository_owner_id","repository","workflow_ref","ref","event_name","sub"]});
    const checks={repositoryId:payload.repository_id==="1414889716",ownerId:payload.repository_owner_id==="84653892",repository:payload.repository===repository,
      // GitHub supports customized subject templates. The exact signed repo,
      // owner, ref, workflow and event claims below bind the caller identity.
      ref:payload.ref==="refs/heads/master",subject:typeof payload.sub==="string" && payload.sub.length>0,
      workflow:payload.workflow_ref===`${repository}/.github/workflows/callback-email-reminders.yml@refs/heads/master`,
      event:payload.event_name==="schedule" || payload.event_name==="workflow_dispatch" || payload.event_name==="push"};
    const rejected=Object.entries(checks).filter(([,valid])=>!valid).map(([field])=>field);
    if(rejected.length)console.warn("Callback scheduler identity fields rejected.",rejected.join(","));
    return rejected.length===0;
  } catch(error){console.warn("Callback scheduler identity verification failed.",error && typeof error==="object" && "code" in error ? String(error.code) : "JWT_REJECTED");return false;}
}
