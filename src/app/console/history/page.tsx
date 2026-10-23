import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isApprovedOperator } from "@/lib/access";
import { reviewStorageConfigured } from "@/lib/review-db";
import { Unauthorized } from "@/components/console/unauthorized";
import { HistoryWorkspace } from "@/components/console/history-workspace";
export const metadata:Metadata = {title:"Call history",robots:{index:false,follow:false}};
export default async function CallHistoryPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=%2Fconsole%2Fhistory");
  if (!isApprovedOperator(userId)) return <Unauthorized userId={userId}/>;
  return <HistoryWorkspace configured={reviewStorageConfigured()}/>;
}
