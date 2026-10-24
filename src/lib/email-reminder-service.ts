import "server-only";
import { operatorHasAccess as isApprovedOperator, approvedOperatorIds } from "@/lib/access";
import { emailReminderConfig } from "@/lib/email-reminder-config";
import { verifiedOperatorEmail } from "@/lib/email-recipient";
import { reminderEmail } from "@/lib/email-reminder-message";
import { claimEmailJob, prepareEmailJob, finishEmailJob } from "@/lib/email-reminder-store";
import { MailError, sendReminderEmail } from "@/lib/resend-mail";

export async function dispatchCallbackEmails() {
  const config=emailReminderConfig();if(!config)throw new Error("Email delivery is not configured.");
  const operators=await approvedOperatorIds();
  const summary={accepted:0,retry:0,failed:0,skipped:0};
  const start=Date.now();
  for(let index=0;index<10 && Date.now()-start<35000;index++) {
    const job=await claimEmailJob(operators);if(!job)break;
    try {
      if(!(await isApprovedOperator(job.operatorId))){summary.skipped++;continue;}
      const recipient=await verifiedOperatorEmail(job.operatorId);
      if(!recipient || (job.payload && job.payload.to[0]!==recipient)) {
        await finishEmailJob(job,{errorCode:"recipient_unavailable",retryable:false});summary.failed++;continue;
      }
      const payload=job.payload || reminderEmail(job,recipient,config.from,config.site);
      if(!await prepareEmailJob(job,payload,operators)){summary.skipped++;continue;}
      const providerId=await sendReminderEmail(config.apiKey,payload,`veilcall-callback/${job.callSid}/${job.scheduleVersion}`);
      await finishEmailJob(job,{providerId});summary.accepted++;
    } catch(issue) {
      // Unknown errors (including a write after provider acceptance) retry with
      // the persisted payload and key; nothing logs recipients or provider bodies.
      const error=issue instanceof MailError ? issue : new MailError("delivery_unconfirmed",true);
      await finishEmailJob(job,{errorCode:error.code,retryable:error.retryable});
      if(error.retryable)summary.retry++;else summary.failed++;
    }
  }
  return summary;
}
