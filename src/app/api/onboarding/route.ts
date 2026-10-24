import { numberApiError, numberOperator, isNumberAdmin, legacyCallerOwner } from "@/lib/number-access";
import { getBusinessProfile, listCallerIdentities, listNumberRequests } from "@/lib/number-store";
import { getApprovedCallerIds } from "@/lib/caller-ids";
import { operatorHasAccess as isApprovedOperator } from "@/lib/access";
import { numberVerificationEnabled } from "@/lib/number-service";
import { voiceJson } from "@/lib/voice-responses";
export const runtime="nodejs";
export async function GET() {
  const operator=await numberOperator();if(operator instanceof Response)return operator;
  try {
    const [profile,requests,identities]=await Promise.all([getBusinessProfile(operator.userId),listNumberRequests(operator.userId),listCallerIdentities(operator.userId)]);
    return voiceJson({profile,requests,identities,legacyCallerIds:operator.userId===legacyCallerOwner() ? getApprovedCallerIds() : [],
      operatorApproved:await isApprovedOperator(operator.userId),admin:isNumberAdmin(operator.userId),verificationEnabled:numberVerificationEnabled()});
  } catch(error){return numberApiError(error);}
}
