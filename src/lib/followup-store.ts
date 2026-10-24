import "server-only";
import { reviewDatabase } from "@/lib/review-db";
import type { FollowUp, FollowUpInput, FollowUpItem, FollowUpView } from "@/lib/followup-types";
const fields=`c.call_sid AS "callSid",COALESCE(f.outcome,'not_set') AS outcome,f.callback_at AS "callbackAt",
  COALESCE(f.note,'') AS note,f.completed_at AS "completedAt"`;
type Row=Omit<FollowUp,"callbackAt"|"completedAt"|"completed"> & {callbackAt:Date | null;completedAt:Date | null};
function serialize<T extends Row>(row:T) {return {...row,callbackAt:row.callbackAt ? new Date(row.callbackAt).toISOString() : null,
  completedAt:row.completedAt ? new Date(row.completedAt).toISOString() : null,completed:!!row.completedAt};}
export async function getFollowUp(callSid:string,operatorId:string):Promise<FollowUp | null> {
  const result=await reviewDatabase().query<Row>(`SELECT ${fields} FROM veilcall_calls c
    LEFT JOIN veilcall_call_followups f ON f.call_sid=c.call_sid WHERE c.call_sid=$1 AND c.operator_id=$2`,[callSid,operatorId]);
  return result.rows[0] ? serialize(result.rows[0]) : null;
}
export async function saveFollowUp(callSid:string,operatorId:string,input:FollowUpInput):Promise<boolean> {
  const result=await reviewDatabase().query(`INSERT INTO veilcall_call_followups(call_sid,outcome,callback_at,note,completed_at)
    SELECT c.call_sid,$3,$4::timestamptz,$5,CASE WHEN $6 THEN now() ELSE NULL END FROM veilcall_calls c
    WHERE c.call_sid=$1 AND c.operator_id=$2
    ON CONFLICT(call_sid) DO UPDATE SET outcome=EXCLUDED.outcome,callback_at=EXCLUDED.callback_at,note=EXCLUDED.note,
      completed_at=CASE WHEN $6 THEN COALESCE(veilcall_call_followups.completed_at,EXCLUDED.completed_at) ELSE NULL END,
      revision=veilcall_call_followups.revision+1,
      reminder_ack_revision=CASE WHEN veilcall_call_followups.outcome=EXCLUDED.outcome
        AND veilcall_call_followups.callback_at IS NOT DISTINCT FROM EXCLUDED.callback_at
        AND (veilcall_call_followups.completed_at IS NOT NULL)=$6
        AND veilcall_call_followups.reminder_ack_revision=veilcall_call_followups.revision
        THEN veilcall_call_followups.revision+1 ELSE NULL END,updated_at=now()`,
    [callSid,operatorId,input.outcome,input.callbackAt,input.note,input.completed]);
  return result.rowCount===1;
}
export async function listFollowUps(operatorId:string,view:FollowUpView,cursor?:{date:string;sid:string}) {
  const filter=view==="completed" ? "f.completed_at IS NOT NULL" : `f.completed_at IS NULL${view==="overdue" ? " AND f.callback_at<now()" : view==="upcoming" ? " AND f.callback_at>=now()" : ""}`;
  const result=await reviewDatabase().query<Row & {phone:string;country:string;name:string | null;company:string | null}>(
    `SELECT ${fields},c.to_number AS phone,c.country,p.name,p.company FROM veilcall_calls c
    JOIN veilcall_call_followups f ON f.call_sid=c.call_sid
    LEFT JOIN veilcall_contacts p ON p.operator_id=c.operator_id AND p.phone_number=c.to_number
    WHERE c.operator_id=$1 AND f.callback_at IS NOT NULL AND ${filter}
    ${cursor ? "AND (f.callback_at,c.call_sid)>($2::timestamptz,$3)" : ""}
    ORDER BY f.callback_at,c.call_sid LIMIT 51`,cursor ? [operatorId,cursor.date,cursor.sid] : [operatorId]);
  const items:FollowUpItem[]=result.rows.slice(0,50).map(serialize);
  const last=items.at(-1);
  return {items,nextCursor:result.rows.length>50 && last ? Buffer.from(JSON.stringify({date:last.callbackAt,sid:last.callSid})).toString("base64url") : null};
}
