export interface CallbackReminder {
  callSid:string;
  phone:string;
  name:string | null;
  callbackAt:string;
  note:string;
  revision:number;
  acknowledged:boolean;
}
export interface ReminderSummary {
  generatedAt:string;
  timezone:string;
  attentionCount:number;
  pendingCount:number;
  items:CallbackReminder[];
}
export type ReminderAction =
  | {action:"acknowledge" | "complete";revision:number}
  | {action:"snooze";revision:number;minutes:15 | 60}
  | {action:"reschedule";revision:number;callbackAt:string};
