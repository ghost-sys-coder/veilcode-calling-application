import type {DraftPrices} from '@/lib/rate-draft-types';
export interface PilotOffer {
  monthlyCents:number|null;
  topups:number[];
  priceId:string;
  policies:{terms:string;privacy:string;recording:string;credit:string;revision:string};
  taxReviewed:boolean;
  policiesApproved:boolean;
  operator:{name:string;country:string;address:string;email:string};
  rates:Record<string,DraftPrices>;
}
export interface PilotRelease {
  id:string;config:PilotOffer;createdAt:string;providerAccountSid:string;
  policySnapshot:{edition:string;documents:Record<string,{title:string;paragraphs:string[]}[]>};
}
export interface PilotControl {
  revision:number;paused:boolean;draft:PilotRelease|null;active:PilotRelease|null;
}
export interface PilotAdminView extends PilotControl {
  releaseEnabled:boolean;issues:string[];
}
export const emptyPilotOffer:PilotOffer={monthlyCents:1900,topups:[1000,2500,5000],priceId:'',
  policies:{terms:'',privacy:'',recording:'',credit:'',revision:''},taxReviewed:false,policiesApproved:false,
  operator:{name:'VeilCode Studio',country:'Uganda',address:'',email:'support@veilcode.studio'},rates:{}};
