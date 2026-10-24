import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isApprovedOperator } from "@/lib/access";
import { reviewStorageConfigured } from "@/lib/review-db";
import { Unauthorized } from "@/components/console/unauthorized";
import { DashboardWorkspace } from "@/components/console/dashboard-workspace";
export const metadata:Metadata={title:"Outreach dashboard",robots:{index:false,follow:false}};
export default async function DashboardPage() {
  const {userId}=await auth();
  if (!userId) redirect("/sign-in?redirect_url=%2Fconsole%2Fdashboard");
  if (!isApprovedOperator(userId)) return <Unauthorized/>;
  return <DashboardWorkspace configured={reviewStorageConfigured()}/>;
}
