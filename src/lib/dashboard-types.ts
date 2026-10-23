export const dashboardRanges=[{value:"today",label:"Today",days:1},{value:"7d",label:"Last 7 days",days:7},{value:"30d",label:"Last 30 days",days:30}] as const;
export type DashboardRange=typeof dashboardRanges[number]["value"];
export interface DashboardCall {callSid:string;phone:string;name:string | null;country:string;startedAt:string;status:string;duration:number;hasAudio:boolean}
export interface DashboardCallback {callSid:string;phone:string;name:string | null;callbackAt:string;note:string}
export interface OutreachDashboard {
  generatedAt:string;periodStart:string;timezone:string;
  calls:number;connected:number;finished:number;interested:number;rated:number;averageRating:number | null;
  dueToday:number;overdue:number;recent:DashboardCall[];callbacks:DashboardCallback[];
}
