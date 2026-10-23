export const callOutcomes = [
  {value:"not_set",label:"Not set"},
  {value:"interested",label:"Interested"},
  {value:"not_interested",label:"Not interested"},
  {value:"no_answer",label:"No answer"},
  {value:"callback_needed",label:"Callback needed"},
] as const;
export type CallOutcome = typeof callOutcomes[number]["value"];
export interface FollowUpInput { outcome:CallOutcome; callbackAt:string | null; note:string; completed:boolean }
export interface FollowUp extends FollowUpInput { callSid:string; completedAt:string | null }
export interface FollowUpItem extends FollowUp { phone:string; country:string; name:string | null; company:string | null }
export interface FollowUpPage { items:FollowUpItem[]; nextCursor:string | null }
export type FollowUpView = "open" | "overdue" | "upcoming" | "completed";
