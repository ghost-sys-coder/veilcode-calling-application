import { billingOperator, billingApiError } from "@/lib/billing-auth";
import { requireTestBilling } from "@/lib/billing-config";
import { getStripeMode } from "@/lib/stripe-config";
import { isApprovedOperator, operatorHasAccess } from "@/lib/access";
import { isNumberAdmin } from "@/lib/number-access";
import { getBillingAccount, listBillingEntries } from "@/lib/billing-store";
import { voiceJson } from "@/lib/voice-responses";
export const runtime="nodejs";
export async function GET(){
  const operator=await billingOperator();if(operator instanceof Response)return operator;
  try{
    const mode=getStripeMode(),account=await getBillingAccount(operator.userId,mode),admin=isNumberAdmin(operator.userId);
    let ready=false;try{requireTestBilling();ready=true;}catch{/* Display the unavailable state until setup is complete. */}
    return voiceJson({mode,enabled:ready && admin,legacy:isApprovedOperator(operator.userId),admin,approved:await operatorHasAccess(operator.userId),
      account:{subscriptionStatus:account.subscriptionStatus,paidUntil:account.paidUntil,balanceMicro:account.balanceMicro,heldMicro:account.heldMicro,blocked:account.blocked},
      monthlyCents:mode==="test" ? 1900 : null,topups:mode==="test" ? [1000,2500,5000] : [],transactions:await listBillingEntries(account.id)});
  }catch(error){return billingApiError(error);}
}
