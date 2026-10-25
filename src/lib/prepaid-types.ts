export const prepaidScenarios=[{value:'completed',label:'Answered'},{value:'busy',label:'Busy'},{value:'no-answer',label:'No answer'},{value:'failed',label:'Failed attempt'},{value:'canceled',label:'Canceled while ringing'}] as const;
export type PrepaidScenario=typeof prepaidScenarios[number]['value'];
export interface PrepaidQuote {
  id:string;to:string;from:string;route:string;rateMicro:number;feeMicro:number;
  maxSeconds:number;heldMicro:number;expiresAt:string;
}
export interface PrepaidSession extends PrepaidQuote {
  status:'reserved'|'active'|'settled'|'released';chargeMicro:number|null;seconds:number|null;
  run:{scenario:PrepaidScenario;requestedSeconds:number;connectedSeconds:number;durationLimit:number;finishesAt:string;completedAt:string|null}|null;
}
export interface PrepaidView {
  availableMicro:number;heldMicro:number;balanceMicro:number;blocked:boolean;subscriptionReady:boolean;
  session:PrepaidSession|null;callers:{number:string;label:string}[];
}
export interface TestCallProof {
  source:'prepaid-test';accountSid:string;
  parent:{sid:string;from:string;status:string;duration:number};
  child:{sid:string;parentSid:string;from:string;to:string;status:string;duration:number};
}
