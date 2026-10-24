import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
export async function verifiedOperatorEmail(operatorId:string):Promise<string | null> {
  const user=await (await clerkClient()).users.getUser(operatorId);
  const primary=user.emailAddresses.find((email)=>email.id===user.primaryEmailAddressId);
  return !user.banned && !user.locked && primary?.verification?.status==="verified" ? primary.emailAddress : null;
}
