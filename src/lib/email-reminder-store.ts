import "server-only";
import { randomUUID } from "node:crypto";
import { reviewDatabase } from "@/lib/review-db";
import type { EmailJob, EmailPayload, EmailPreferences } from "@/lib/email-reminder-types";

export async function getEmailPreferences(operatorId:string):Promise<EmailPreferences & {lastStatus:string | null;lastSentAt:string | null}> {
  const result=await reviewDatabase().query(`SELECT p.enabled,p.timezone,p.enabled_at AS "enabledAt",
    (SELECT status FROM veilcall_callback_emails WHERE operator_id=$1 ORDER BY created_at DESC LIMIT 1) AS "lastStatus",
    (SELECT max(sent_at) FROM veilcall_callback_emails WHERE operator_id=$1) AS "lastSentAt"
    FROM veilcall_email_preferences p WHERE p.operator_id=$1`,[operatorId]);
  const row=result.rows[0];
  return row ? {...row,enabledAt:new Date(row.enabledAt).toISOString(),lastSentAt:row.lastSentAt ? new Date(row.lastSentAt).toISOString() : null}
    : {enabled:false,timezone:"UTC",enabledAt:new Date(0).toISOString(),lastStatus:null,lastSentAt:null};
}
export async function saveEmailPreferences(operatorId:string,enabled:boolean,timezone:string) {
  await reviewDatabase().query(`INSERT INTO veilcall_email_preferences(operator_id,enabled,timezone) VALUES($1,$2,$3)
    ON CONFLICT(operator_id) DO UPDATE SET enabled=EXCLUDED.enabled,timezone=EXCLUDED.timezone,
      enabled_at=CASE WHEN NOT veilcall_email_preferences.enabled AND EXCLUDED.enabled THEN clock_timestamp() ELSE veilcall_email_preferences.enabled_at END,
      updated_at=clock_timestamp()`,[operatorId,enabled,timezone]);
}

// A distinct schedule version prevents note edits and alert dismissals from
// creating a second email for a callback that already has an accepted email.
const eligible=`c.operator_id=e.operator_id AND c.operator_id=ANY($1::text[]) AND p.enabled
  AND f.outcome='callback_needed' AND f.completed_at IS NULL
  AND f.email_schedule_version=e.schedule_version AND f.callback_at=e.callback_at
  AND f.callback_at>=p.enabled_at AND f.callback_at<=now() AND f.callback_at>now()-interval '24 hours'
  AND f.reminder_ack_revision IS DISTINCT FROM f.revision`;

export async function claimEmailJob(operators:string[]):Promise<EmailJob | null> {
  await reviewDatabase().query(`INSERT INTO veilcall_callback_emails(call_sid,schedule_version,operator_id,callback_at)
    SELECT f.call_sid,f.email_schedule_version,c.operator_id,f.callback_at FROM veilcall_call_followups f
      JOIN veilcall_calls c ON c.call_sid=f.call_sid JOIN veilcall_email_preferences p ON p.operator_id=c.operator_id
    WHERE c.operator_id=ANY($1::text[]) AND p.enabled AND f.outcome='callback_needed' AND f.completed_at IS NULL
      AND f.callback_at>=p.enabled_at AND f.callback_at<=now() AND f.callback_at>now()-interval '24 hours'
      AND f.reminder_ack_revision IS DISTINCT FROM f.revision
      AND NOT EXISTS(SELECT 1 FROM veilcall_callback_emails existing WHERE existing.call_sid=f.call_sid AND existing.schedule_version=f.email_schedule_version)
    ORDER BY f.callback_at,f.call_sid LIMIT 100 ON CONFLICT(call_sid,schedule_version) DO NOTHING`,[operators]);
  await reviewDatabase().query(`UPDATE veilcall_callback_emails e SET status=CASE WHEN first_attempt_at<now()-interval '23 hours' THEN 'failed' ELSE 'canceled' END,
    error_code=CASE WHEN first_attempt_at<now()-interval '23 hours' THEN 'retry_window_expired' ELSE 'callback_changed' END,lease_token=NULL,lease_until=NULL
    WHERE e.status='pending' AND (e.lease_until IS NULL OR e.lease_until<now()) AND
    (e.first_attempt_at<now()-interval '23 hours' OR NOT EXISTS(
      SELECT 1 FROM veilcall_calls c JOIN veilcall_call_followups f ON f.call_sid=c.call_sid
      JOIN veilcall_email_preferences p ON p.operator_id=c.operator_id WHERE c.call_sid=e.call_sid AND ${eligible}))`,[operators]);
  const result=await reviewDatabase().query(`WITH candidate AS (
    SELECT e.call_sid,e.schedule_version FROM veilcall_callback_emails e
      JOIN veilcall_calls c ON c.call_sid=e.call_sid JOIN veilcall_call_followups f ON f.call_sid=c.call_sid
      JOIN veilcall_email_preferences p ON p.operator_id=c.operator_id
    WHERE e.status='pending' AND e.next_attempt_at<=now() AND (e.lease_until IS NULL OR e.lease_until<now())
      AND (e.first_attempt_at IS NULL OR e.first_attempt_at>now()-interval '23 hours') AND ${eligible}
    ORDER BY e.callback_at,e.call_sid FOR UPDATE OF e SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE veilcall_callback_emails e SET lease_token=$2,lease_until=now()+interval '90 seconds',attempts=e.attempts+1
    FROM candidate q WHERE e.call_sid=q.call_sid AND e.schedule_version=q.schedule_version RETURNING e.*
  ) SELECT e.call_sid AS "callSid",e.schedule_version AS "scheduleVersion",e.operator_id AS "operatorId",e.callback_at AS "callbackAt",
    e.lease_token AS "leaseToken",e.payload,c.to_number AS phone,p.name,s.timezone FROM claimed e
    JOIN veilcall_calls c ON c.call_sid=e.call_sid JOIN veilcall_email_preferences s ON s.operator_id=e.operator_id
    LEFT JOIN veilcall_contacts p ON p.operator_id=e.operator_id AND p.phone_number=c.to_number`,[operators,randomUUID()]);
  const row=result.rows[0];return row ? {...row,callbackAt:new Date(row.callbackAt).toISOString()} : null;
}

// Freeze the exact provider payload before sending so retries use the same
// idempotency key AND body, even if a contact's name or timezone later changes.
export async function prepareEmailJob(job:EmailJob,payload:EmailPayload,operators:string[]):Promise<boolean> {
  const result=await reviewDatabase().query(`UPDATE veilcall_callback_emails e SET payload=COALESCE(e.payload,$5::jsonb),first_attempt_at=COALESCE(e.first_attempt_at,clock_timestamp())
    FROM veilcall_calls c JOIN veilcall_call_followups f ON f.call_sid=c.call_sid JOIN veilcall_email_preferences p ON p.operator_id=c.operator_id
    WHERE e.call_sid=$2 AND e.schedule_version=$3 AND e.lease_token=$4 AND e.lease_until>now() AND e.status='pending'
      AND c.call_sid=e.call_sid AND ${eligible}`,[operators,job.callSid,job.scheduleVersion,job.leaseToken,JSON.stringify(payload)]);
  return result.rowCount===1;
}
export async function finishEmailJob(job:EmailJob,result:{providerId:string} | {errorCode:string;retryable:boolean}) {
  const sent="providerId" in result;
  await reviewDatabase().query(`UPDATE veilcall_callback_emails SET
    status=CASE WHEN $4 THEN 'sent' WHEN $6 AND attempts<8 THEN 'pending' ELSE 'failed' END,
    provider_id=$5,error_code=$7,sent_at=CASE WHEN $4 THEN clock_timestamp() ELSE NULL END,
    next_attempt_at=now()+(LEAST(3600,60*power(2,LEAST(attempts,6))) * interval '1 second'),lease_token=NULL,lease_until=NULL
    WHERE call_sid=$1 AND schedule_version=$2 AND lease_token=$3`,[job.callSid,job.scheduleVersion,job.leaseToken,sent,sent ? result.providerId : null,!sent && result.retryable,sent ? null : result.errorCode]);
}
