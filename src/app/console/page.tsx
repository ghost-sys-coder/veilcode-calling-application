import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { CallWorkspace } from "@/components/console/call-workspace";
import { ConsoleHeader } from "@/components/console/console-header";
import { Unauthorized } from "@/components/console/unauthorized";
import { isApprovedOperator } from "@/lib/access";
import { getVoiceConfigStatus } from "@/lib/voice-config";

export const metadata: Metadata = {
  title: "Private call console",
  description: "Protected VeilCall browser voice workspace.",
  robots: { index: false, follow: false },
};

export default async function ConsolePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=%2Fconsole");
  if (!isApprovedOperator(userId)) return <Unauthorized userId={userId} />;
  const status = getVoiceConfigStatus();
  return <><ConsoleHeader/><main><CallWorkspace configured={status.ready} setupIssues={status.missing} callerIds={status.callerIds}/></main></>;
}
