export const costRanges=[{value:'7d',label:'Last 7 UTC days',days:7},{value:'30d',label:'Last 30 UTC days',days:30},{value:'90d',label:'Last 90 UTC days',days:90}] as const;
export type CostRange=typeof costRanges[number]['value'];
export type CostKind='browser'|'telephone'|'recording';
export interface CostResource {
  sid:string;kind:CostKind;status:string;durationSeconds:number|null;
  amountMicro:number|null;currency:string|null;
}
export interface CostAmounts {currency:string;browserMicro:number;telephoneMicro:number;recordingMicro:number;totalMicro:number}
export interface CostCall {
  callSid:string;to:string;country:string;startedAt:string;status:string;duration:number;
  route:string;checkedAt:string|null;state:'untracked'|'pending'|'complete'|'stale';canReview:boolean;discoveryComplete:boolean;
  resources:CostResource[];charges:CostAmounts[];
}
export interface CallCostReport {
  range:CostRange;startDate:string;endDate:string;generatedAt:string;
  calls:CostCall[];totals:CostAmounts[];complete:number;pending:number;hasMore:boolean;due:number;
  storage:{amountMicro:number|null;currency:string|null;asOf:string|null;checkedAt:string}|null;
}
export interface CostSyncResult {synced:number;failed:number;remaining:number;storageSynced:boolean}
