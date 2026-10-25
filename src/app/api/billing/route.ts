import { billingOperator, billingApiError } from "@/lib/billing-auth";
import { requireTestBilling } from "@/lib/billing-config";
import { getStripeMode } from "@/lib/stripe-config";
import { isApprovedOperator, operatorHasAccess } from "@/lib/access";
import { isNumberAdmin } from "@/lib/number-access";
import { getBillingAccount, listBillingEntries,subscriptionMonthlyCents } from "@/lib/billing-store";
import { voiceJson } from "@/lib/voice-responses";
import {requirePilotCustomer} from '@/lib/pilot-service';
import {pilotControl,policiesAccepted,policyServiceReady} from '@/lib/pilot-store';
import {liveCallState} from '@/lib/live-calling-store';
export const runtime="nodejs";
export async function GET(){
  const operator=await billingOperator();if(operator instanceof Response)return operator;
  try{
    const mode=getStripeMode(),admin=isNumberAdmin(operator.userId);
    if(mode==='live')await liveCallState(operator.userId);
    const account=await getBillingAccount(operator.userId,mode);
    let ready=false;try{requireTestBilling();ready=true;}catch{/* Display the unavailable state until setup is complete. */}
    let eligibilityMessage='',offer=null;
    const control=mode==='live'?await pilotControl():null;
    if(mode==='live'){
      try{await requirePilotCustomer(operator.userId);ready=true;}catch(error){eligibilityMessage=(error as Error).message;}
      if(control?.active){const release=control.active;
        offer={id:release.id,policies:release.config.policies,accepted:await policiesAccepted(operator.userId,release.id),serviceReady:await policyServiceReady(operator.userId,release.id)};
      }
    }
    return voiceJson({mode,enabled:ready && (mode==='live'||admin),legacy:isApprovedOperator(operator.userId),admin,approved:await operatorHasAccess(operator.userId),
      account:{subscriptionStatus:account.subscriptionStatus,paidUntil:account.paidUntil,balanceMicro:account.balanceMicro,heldMicro:account.heldMicro,blocked:account.blocked},
      monthlyCents:mode==="test" ? 1900 : (account.subscriptionStatus==='active'?await subscriptionMonthlyCents(account):null)??control?.active?.config.monthlyCents??null,topups:mode==="test" ? [1000,2500,5000] : control?.active?.config.topups??[],
      portalAvailable:Boolean(account.customerId && (mode==='test'?ready:process.env.STRIPE_PROD_WEBHOOK_SECRET)),eligibilityMessage,offer,transactions:await listBillingEntries(account.id)});
  }catch(error){return billingApiError(error);}
}
