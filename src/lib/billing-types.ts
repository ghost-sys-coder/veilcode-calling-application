export type BillingMode = "test" | "live";
export type AccessStatus = "pending" | "approved" | "rejected" | "suspended";
export interface OperatorAccess {status:AccessStatus; revision:number; reviewNote:string; updatedAt:string}
export interface AccessCustomer {
  operatorId:string; businessName:string; contactName:string; businessCountry:string;
  website:string; purpose:string; access:OperatorAccess;
}
export interface BillingAccount {
  id:string; operatorId:string; mode:BillingMode; customerId:string|null; subscriptionId:string|null;
  subscriptionStatus:string; paidUntil:string|null; balanceMicro:number; heldMicro:number; blocked:boolean;
}
export interface BillingOrder {
  id:string; accountId:string; kind:"subscription"|"topup"; amountCents:number; priceId:string|null;
  status:string; checkoutId:string|null; checkoutUrl:string|null; paymentIntentId:string|null;
  offerId?:string|null;
}
export interface BillingRate {route:string; rateMicro:number; feeMicro:number; mode:BillingMode}
export interface CallReservation extends BillingRate {
  id:string; accountId:string; operatorId:string; to:string; from:string; heldMicro:number;
  maxSeconds:number; status:string; callSid:string|null; expiresAt:string;
}
export interface BillingSummary {
  mode:BillingMode; enabled:boolean; legacy:boolean; admin:boolean; approved:boolean;
  account:Pick<BillingAccount,"subscriptionStatus"|"paidUntil"|"balanceMicro"|"heldMicro"|"blocked">;
  monthlyCents:number|null; topups:number[];
  transactions:{id:string;kind:string;amountMicro:number;description:string;createdAt:string}[];
  portalAvailable?:boolean;eligibilityMessage?:string;
  offer?:{id:string;policies:{terms:string;privacy:string;recording:string;credit:string;revision:string};accepted:boolean;serviceReady:boolean}|null;
}
