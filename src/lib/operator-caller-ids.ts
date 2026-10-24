import "server-only";
import { getApprovedCallerIds } from "@/lib/caller-ids";
import { legacyCallerOwner } from "@/lib/number-access";
import { listCallerIdentities } from "@/lib/number-store";
import { reviewStorageConfigured } from "@/lib/review-db";
import type { CallerIdOption } from "@/lib/caller-id-types";

export async function operatorCallerIds(operatorId:string):Promise<CallerIdOption[]> {
  const legacy=operatorId===legacyCallerOwner() ? getApprovedCallerIds() : [];
  if (!reviewStorageConfigured()) return legacy;
  try {
    const identities=await listCallerIdentities(operatorId);
    const options=new Map(legacy.map(option=>[option.number,option]));
    for (const identity of identities) if(identity.status==="active") options.set(identity.number,{number:identity.number,label:identity.label});
    return [...options.values()];
  } catch(error) {
    // Preserve the existing owner's configured dialer during a storage outage.
    // Every other operator fails closed rather than inheriting configured numbers.
    if (legacy.length) return legacy;
    throw error;
  }
}
