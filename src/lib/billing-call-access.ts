import "server-only";
import { isApprovedOperator } from "@/lib/access";
import { BillingError,liveBillingEnabled } from "@/lib/billing-config";
import {requirePilotCustomer} from '@/lib/pilot-service';
import {policyServiceReady} from '@/lib/pilot-store';
import {getBillingAccount} from '@/lib/billing-store';

// Configured legacy operators retain access. Other customers need the current
// activated offer and a paid live account; test credit never buys Twilio access.
export async function requireRealCallingAccess(operatorId:string):Promise<void> {
  if(isApprovedOperator(operatorId))return;
  if(!liveBillingEnabled())throw new BillingError("Paid calling is not available yet. Your account and phone number can be set up while the pilot is being prepared.",402);
  const release=await requirePilotCustomer(operatorId),account=await getBillingAccount(operatorId,'live');
  if(!await policyServiceReady(operatorId,release.id))throw new BillingError('Review your service policies in Billing & credit.',402);
  if(account.mode!=='live'||account.blocked||account.subscriptionStatus!=='active'||!account.paidUntil||Date.parse(account.paidUntil)<=Date.now())throw new BillingError('An active paid subscription and an unpaused account are required.',402);
}
