export interface SettlementReviewItem {
  id:string;revision:number;route:string;destination:string;heldMicro:number;
  reason:string|null;attempts:number;createdAt:string;
}
export interface SettlementReport {
  pending:number;due:number;review:number;done:number;
  items:SettlementReviewItem[];lastAutomaticCheck:string|null;lastAutomaticFailure:string|null;
}
export const settlementReasons:Record<string,string>={
  'provider-unavailable':'Twilio could not be reached.',
  'provider-pending':'Twilio has not published complete call records.',
  'provider-mismatch':'The provider account or call details differ from the permit.',
  'duration-invalid':'The call durations need investigation.',
  'attempts-exhausted':'Repeated checks could not verify the final call result.',
};
