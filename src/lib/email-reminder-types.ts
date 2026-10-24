export interface EmailPreferences {enabled:boolean;timezone:string;enabledAt:string}
export interface EmailPayload {from:string;to:string[];subject:string;text:string;html:string}
export interface EmailJob {
  callSid:string;scheduleVersion:number;operatorId:string;callbackAt:string;
  phone:string;name:string | null;timezone:string;leaseToken:string;
  payload:EmailPayload | null;
}
export interface EmailSettings extends EmailPreferences {
  configured:boolean;recipient:string | null;lastStatus:string | null;lastSentAt:string | null;
}
