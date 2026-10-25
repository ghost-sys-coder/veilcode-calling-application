import "server-only";
import { timingSafeEqual } from "node:crypto";
import { githubSchedulerAuthorized } from "@/lib/github-scheduler-auth";
export const emailDispatchAudience="https://call.veilcode.studio/callback-email-dispatch";

export async function emailDispatchAuthorized(request:Request):Promise<boolean> {
  const authorization=request.headers.get("authorization") || "";
  const secret=process.env.CRON_SECRET;
  if(secret){const expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(authorization);if(actual.length===expected.length && timingSafeEqual(expected,actual))return true;}
  return githubSchedulerAuthorized(request,emailDispatchAudience,"callback-email-reminders.yml");
}
