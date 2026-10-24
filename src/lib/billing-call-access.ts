import "server-only";
import { isApprovedOperator } from "@/lib/access";
import { BillingError } from "@/lib/billing-config";

// Only the explicitly allowlisted pilot can make real calls in this release.
// Customer approval opens the workspace, but sandbox money never buys Twilio
// access. Live rate cards, pricing and payment policies require a later release.
export function requireRealCallingAccess(operatorId:string):void {
  if(!isApprovedOperator(operatorId))throw new BillingError("Paid calling is not available yet. Your account and phone number can be set up while the pilot is being prepared.",402);
}
