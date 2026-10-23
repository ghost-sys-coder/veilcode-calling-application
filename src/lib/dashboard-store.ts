import "server-only";
import { reviewDatabase } from "@/lib/review-db";
import { dashboardRanges, type DashboardRange, type OutreachDashboard } from "@/lib/dashboard-types";

// One query gives all cards and bounded lists the same database snapshot.
export async function getDashboard(operatorId:string,range:DashboardRange,timezone:string):Promise<OutreachDashboard> {
  const days=dashboardRanges.find((item)=>item.value===range)!.days;
  const result=await reviewDatabase().query<{dashboard:OutreachDashboard}>(`WITH bounds AS (
    SELECT now() AS stamp,
      ((now() AT TIME ZONE $2)::date::timestamp AT TIME ZONE $2) AS today,
      (((now() AT TIME ZONE $2)::date+1)::timestamp AT TIME ZONE $2) AS tomorrow,
      (((now() AT TIME ZONE $2)::date-($3::int-1))::timestamp AT TIME ZONE $2) AS period_start
  ), owned AS (
    SELECT c.* FROM veilcall_calls c WHERE c.operator_id=$1
  ), activity AS (
    SELECT c.* FROM owned c,bounds b WHERE c.started_at>=b.period_start AND c.started_at<=b.stamp
  ), latest_classified AS (
    SELECT DISTINCT ON (c.to_number) c.to_number,c.started_at,f.outcome FROM owned c
      JOIN veilcall_call_followups f ON f.call_sid=c.call_sid
      WHERE c.to_number<>'' AND f.outcome<>'not_set' AND c.started_at<=(SELECT stamp FROM bounds)
      ORDER BY c.to_number,c.started_at DESC,c.call_sid DESC
  ), open_callbacks AS (
    SELECT c.call_sid,c.to_number,f.callback_at,f.note FROM owned c
      JOIN veilcall_call_followups f ON f.call_sid=c.call_sid
      WHERE f.outcome='callback_needed' AND f.callback_at IS NOT NULL AND f.completed_at IS NULL
  ), recent AS (
    SELECT c.call_sid AS "callSid",c.to_number AS phone,p.name,c.country,c.started_at AS "startedAt",c.status,c.duration_seconds AS duration,
      EXISTS(SELECT 1 FROM veilcall_recordings r WHERE r.call_sid=c.call_sid AND r.status='completed' AND r.deleted_at IS NULL AND r.expires_at>(SELECT stamp FROM bounds)) AS "hasAudio"
    FROM activity c LEFT JOIN veilcall_contacts p ON p.operator_id=$1 AND p.phone_number=c.to_number
    ORDER BY c.started_at DESC,c.call_sid DESC LIMIT 6
  ), attention AS (
    SELECT c.call_sid AS "callSid",c.to_number AS phone,p.name,c.callback_at AS "callbackAt",c.note
    FROM open_callbacks c LEFT JOIN veilcall_contacts p ON p.operator_id=$1 AND p.phone_number=c.to_number
    WHERE c.callback_at<(SELECT tomorrow FROM bounds) ORDER BY c.callback_at,c.call_sid LIMIT 5
  ) SELECT jsonb_build_object(
    'generatedAt',b.stamp,'periodStart',b.period_start,'timezone',$2::text,
    'calls',(SELECT count(*) FROM activity),
    'connected',(SELECT count(*) FROM activity WHERE status='completed'),
    'finished',(SELECT count(*) FROM activity WHERE status IN ('completed','failed','busy','no-answer','canceled')),
    'interested',(SELECT count(*) FROM latest_classified WHERE outcome='interested' AND started_at>=b.period_start),
    'rated',(SELECT count(rating) FROM activity),'averageRating',(SELECT round(avg(rating),1) FROM activity),
    'dueToday',(SELECT count(*) FROM open_callbacks WHERE callback_at>=b.today AND callback_at<b.tomorrow),
    'overdue',(SELECT count(*) FROM open_callbacks WHERE callback_at<b.stamp),
    'recent',COALESCE((SELECT jsonb_agg(r ORDER BY r."startedAt" DESC,r."callSid" DESC) FROM recent r),'[]'::jsonb),
    'callbacks',COALESCE((SELECT jsonb_agg(a ORDER BY a."callbackAt",a."callSid") FROM attention a),'[]'::jsonb)
  ) AS dashboard FROM bounds b`,[operatorId,timezone,days]);
  return result.rows[0].dashboard;
}
