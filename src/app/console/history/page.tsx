import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isApprovedOperator } from "@/lib/access";
import { reviewStorageConfigured } from "@/lib/review-db";
import { Unauthorized } from "@/components/console/unauthorized";
import { HistoryWorkspace } from "@/components/console/history-workspace";
import { getReview } from "@/lib/review-store";
import { callSidPattern } from "@/lib/review-validation";
export const metadata:Metadata = {title:"Call history",robots:{index:false,follow:false}};
export default async function CallHistoryPage({searchParams}:{searchParams:Promise<{call?:string | string[]}>}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=%2Fconsole%2Fhistory");
  if (!isApprovedOperator(userId)) return <Unauthorized userId={userId}/>;
  const {call}=await searchParams;
  let initialCall;
  let initialError;
  if (call) {
    try {
      if (typeof call!=="string" || !callSidPattern.test(call)) throw new Error();
      initialCall=await getReview(call,userId) ?? undefined;
      if (!initialCall) throw new Error();
    } catch {initialError="That call could not be opened. Choose another call below.";}
  }
  return <HistoryWorkspace key={typeof call==="string" ? call : "history"} configured={reviewStorageConfigured()} initialCall={initialCall} initialError={initialError}/>;
}
