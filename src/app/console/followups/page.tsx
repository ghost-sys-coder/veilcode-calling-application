import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isApprovedOperator } from "@/lib/access";
import { reviewStorageConfigured } from "@/lib/review-db";
import { Unauthorized } from "@/components/console/unauthorized";
import { FollowUpsWorkspace } from "@/components/console/followups-workspace";
export const metadata:Metadata={title:"Follow-ups",robots:{index:false,follow:false}};
export default async function FollowUpsPage() {
  const {userId}=await auth();
  if (!userId) redirect("/sign-in?redirect_url=%2Fconsole%2Ffollowups");
  if (!isApprovedOperator(userId)) return <Unauthorized/>;
  return <FollowUpsWorkspace configured={reviewStorageConfigured()}/>;
}
