import type { FollowUpInput } from "@/lib/followup-types";
import { validateFollowUp } from "@/lib/followup-validation";

export interface CallWrapUp extends FollowUpInput {
  callSid:string;
  phone:string;
  rating:number | null;
  revision:number;
}
export interface WrapUpInput extends FollowUpInput {
  rating:number | null;
  expectedRating:number | null;
  expectedRevision:number;
}
const validRating=(value:unknown):value is number | null => value===null || (typeof value==="number" && Number.isInteger(value) && value>=1 && value<=5);

export function validateWrapUp(value:unknown):WrapUpInput | null {
  const followUp=validateFollowUp(value);
  if (!followUp) return null;
  const data=value as Record<string,unknown>;
  if (!validRating(data.rating) || !validRating(data.expectedRating) || !Number.isSafeInteger(data.expectedRevision) || Number(data.expectedRevision)<0) return null;
  return {...followUp,rating:data.rating,expectedRating:data.expectedRating,expectedRevision:Number(data.expectedRevision)};
}
