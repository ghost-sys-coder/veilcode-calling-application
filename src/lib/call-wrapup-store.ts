import "server-only";
import { reviewDatabase } from "@/lib/review-db";
import { saveFollowUp } from "@/lib/followup-store";
import type { CallWrapUp, WrapUpInput } from "@/lib/call-wrapup";

const fields=`c.call_sid AS "callSid",c.to_number AS phone,c.rating,
  COALESCE(f.outcome,'not_set') AS outcome,f.callback_at AS "callbackAt",
  COALESCE(f.note,'') AS note,(f.completed_at IS NOT NULL) AS completed,COALESCE(f.revision,0) AS revision`;
type Row=Omit<CallWrapUp,"callbackAt"> & {callbackAt:Date | null};
function serialize(row:Row):CallWrapUp {return {...row,callbackAt:row.callbackAt ? new Date(row.callbackAt).toISOString() : null};}

export async function getCallWrapUp(callSid:string,operatorId:string):Promise<CallWrapUp | null> {
  const result=await reviewDatabase().query<Row>(`SELECT ${fields} FROM veilcall_calls c
    LEFT JOIN veilcall_call_followups f ON f.call_sid=c.call_sid WHERE c.call_sid=$1 AND c.operator_id=$2`,[callSid,operatorId]);
  return result.rows[0] ? serialize(result.rows[0]) : null;
}

// A single transaction keeps the rating and callback together. Field-specific
// checks allow provider status updates while protecting edits made in another tab.
export async function saveCallWrapUp(callSid:string,operatorId:string,input:WrapUpInput):Promise<CallWrapUp | "conflict" | null> {
  const client=await reviewDatabase().connect();
  try {
    await client.query("BEGIN");
    const call=await client.query<{rating:number | null}>(`SELECT rating FROM veilcall_calls WHERE call_sid=$1 AND operator_id=$2 FOR UPDATE`,[callSid,operatorId]);
    if (!call.rows[0]) {await client.query("ROLLBACK");return null;}
    const followUp=await client.query<{revision:number}>(`SELECT revision FROM veilcall_call_followups WHERE call_sid=$1 FOR UPDATE`,[callSid]);
    if (call.rows[0].rating!==input.expectedRating || (followUp.rows[0]?.revision ?? 0)!==input.expectedRevision) {
      await client.query("ROLLBACK");return "conflict";
    }
    await client.query("UPDATE veilcall_calls SET rating=$3,updated_at=now() WHERE call_sid=$1 AND operator_id=$2",[callSid,operatorId,input.rating]);
    if (!await saveFollowUp(callSid,operatorId,input,client)) throw new Error("Call was not saved.");
    const result=await client.query<Row>(`SELECT ${fields} FROM veilcall_calls c
      LEFT JOIN veilcall_call_followups f ON f.call_sid=c.call_sid WHERE c.call_sid=$1 AND c.operator_id=$2`,[callSid,operatorId]);
    await client.query("COMMIT");
    return serialize(result.rows[0]);
  } catch(error) {await client.query("ROLLBACK").catch(()=>{});throw error;}
  finally {client.release();}
}
