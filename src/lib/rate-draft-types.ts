import type {CostRange} from '@/lib/call-cost-types';
export const draftRoutes=[
  {key:'GB_FIXED_LINE',label:'UK landline'}, {key:'GB_MOBILE',label:'UK mobile'},
  {key:'AU_FIXED_LINE',label:'Australia landline'}, {key:'AU_MOBILE',label:'Australia mobile'},
] as const;
export type DraftRoute=typeof draftRoutes[number]['key'];
export interface DraftPrice {rateMicro:number;feeMicro:number}
export type DraftPrices=Partial<Record<DraftRoute,DraftPrice>>;
export interface RateDraft {revision:number;rates:DraftPrices;updatedAt:string|null}
export interface RateObservation {route:DraftRoute;seconds:number;supplierMicro:number;recorded:boolean}
export interface RateSample {
  startDate:string;endDate:string;examined:number;hasMore:boolean;observations:RateObservation[];
  excluded:{incomplete:number;currency:number;route:number;duration:number};
}
export interface RateDraftView {
  callers:{number:string;label:string}[];from:string;range:CostRange;draft:RateDraft;sample:RateSample;
}
