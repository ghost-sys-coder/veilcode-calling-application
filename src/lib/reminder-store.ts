import "server-only";
import { reviewDatabase } from "@/lib/review-db";
import type { ReminderAction, ReminderSummary } from "@/lib/reminder-types";

// Counts and a bounded list share one snapshot. Today is the browser's calendar
// day; tomorrow's boundary is calculated in that zone, including DST changes.
export async function getReminders(operatorId:string,timezone:string):Promise<ReminderSummary> {
  const result=await reviewDatabase().query<{summary:ReminderSummary}>(`WITH bounds AS (
    SELECT now() AS stamp,(((now() AT TIME ZONE $2)::date+1)::timestamp AT TIME ZONE $2) AS tomorrow
  ), callbacks AS (
    SELECT c.call_sid AS "callSid",c.to_number AS phone,p.name,f.callback_at AS "callbackAt",f.note,f.revision,
      COALESCE(f.reminder_ack_revision=f.revision,false) AS acknowledged
    FROM veilcall_call_followups f JOIN veilcall_calls c ON c.call_sid=f.call_sid
    LEFT JOIN veilcall_contacts p ON p.operator_id=c.operator_id AND p.phone_number=c.to_number
    WHERE c.operator_id=$1 AND f.outcome='callback_needed' AND f.completed_at IS NULL
      AND f.callback_at<(SELECT tomorrow FROM bounds)
  ), ranked AS (
    SELECT *,NOT acknowledged AND "callbackAt"<=b.stamp AS pending FROM callbacks,bounds b
  ), preview AS (
    SELECT * FROM ranked ORDER BY pending DESC,"callbackAt","callSid" LIMIT 20
  ) SELECT jsonb_build_object(
    'generatedAt',b.stamp,'timezone',$2::text,'attentionCount',(SELECT count(*) FROM callbacks),
    'pendingCount',(SELECT count(*) FROM ranked WHERE pending),
    'items',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'callSid',p."callSid",'phone',p.phone,'name',p.name,'callbackAt',p."callbackAt",'note',p.note,
      'revision',p.revision,'acknowledged',p.acknowledged) ORDER BY p.pending DESC,p."callbackAt",p."callSid") FROM preview p),'[]'::jsonb)
  ) AS summary FROM bounds b`,[operatorId,timezone]);
  return result.rows[0].summary;
}

// Each action touches only the intended fields and requires the version shown
// to the operator. A stale notification cannot overwrite a newer callback.
export async function actOnReminder(callSid:string,operatorId:string,input:ReminderAction):Promise<boolean> {
  const assignment=input.action==="acknowledge" ? "reminder_ack_revision=f.revision" : input.action==="complete"
    ? "completed_at=clock_timestamp(),revision=f.revision+1,updated_at=clock_timestamp()"
    : "callback_at=CASE WHEN $4='snooze' THEN clock_timestamp()+($5::int * interval '1 minute') ELSE $6::timestamptz END,revision=f.revision+1,updated_at=clock_timestamp()";
  const params:unknown[]=[callSid,operatorId,input.revision];
  if (input.action==="snooze" || input.action==="reschedule") params.push(input.action,input.action==="snooze" ? input.minutes : null,input.action==="reschedule" ? input.callbackAt : null);
  const result=await reviewDatabase().query(`UPDATE veilcall_call_followups f SET ${assignment}
    FROM veilcall_calls c WHERE c.call_sid=f.call_sid AND c.call_sid=$1 AND c.operator_id=$2
      AND f.revision=$3 AND f.outcome='callback_needed' AND f.completed_at IS NULL
      ${input.action==="acknowledge" ? "AND f.callback_at<=now()" : ""}
      ${input.action==="reschedule" ? "AND $6::timestamptz>clock_timestamp()" : ""}`,params);
  return result.rowCount===1;
}
