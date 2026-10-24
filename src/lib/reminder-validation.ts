import { validateFollowUp } from "@/lib/followup-validation";
import type { ReminderAction } from "@/lib/reminder-types";

export function validateReminderAction(value:unknown,now=Date.now()):ReminderAction | null {
  if (!value || typeof value!=="object") return null;
  const data=value as Record<string,unknown>;
  if (!Number.isSafeInteger(data.revision) || Number(data.revision)<1 || Number(data.revision)>2147483646) return null;
  const revision=Number(data.revision);
  if (data.action==="acknowledge" || data.action==="complete") return {action:data.action,revision};
  if (data.action==="snooze" && (data.minutes===15 || data.minutes===60)) return {action:"snooze",revision,minutes:data.minutes};
  if (data.action==="reschedule") {
    const input=validateFollowUp({outcome:"callback_needed",callbackAt:data.callbackAt,note:"",completed:false});
    if (input?.callbackAt && Date.parse(input.callbackAt)>now) return {action:"reschedule",revision,callbackAt:input.callbackAt};
  }
  return null;
}
