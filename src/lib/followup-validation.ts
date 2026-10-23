import { callOutcomes, type FollowUpInput } from "@/lib/followup-types";

export function validateFollowUp(value:unknown):FollowUpInput | null {
  if (!value || typeof value!=="object") return null;
  const data=value as Record<string,unknown>;
  if (!callOutcomes.some((item)=>item.value===data.outcome) || typeof data.note!=="string" || data.note.length>5000 || typeof data.completed!=="boolean") return null;
  let callbackAt:string | null=null;
  if (data.outcome==="callback_needed") {
    if (typeof data.callbackAt!=="string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(data.callbackAt)) return null;
    const date=new Date(data.callbackAt);
    if (!Number.isFinite(date.getTime()) || date.getUTCFullYear()<2000 || date.getUTCFullYear()>2100 || date.toISOString().slice(0,10)!==data.callbackAt.slice(0,10)) return null;
    callbackAt=date.toISOString();
  } else if (data.callbackAt!==null || data.completed) return null;
  return {outcome:data.outcome as FollowUpInput["outcome"],callbackAt,note:data.note.trim(),completed:data.completed};
}

// datetime-local represents the operator's local time, not UTC.
export function localDateTime(iso:string | null):string {
  if (!iso) return "";
  const date=new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}T${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}`;
}
export function localToUtc(value:string):string | null {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)) return null;
  const date=new Date(value);
  // Reject invalid dates and nonexistent local times during daylight-saving changes.
  return Number.isFinite(date.getTime()) && localDateTime(date.toISOString())===value ? date.toISOString() : null;
}
