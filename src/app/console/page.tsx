import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { CallWorkspace } from "@/components/console/call-workspace";
import { Unauthorized } from "@/components/console/unauthorized";
import { isApprovedOperator } from "@/lib/access";
import { getVoiceConfigStatus } from "@/lib/voice-config";
import { reviewStorageConfigured } from "@/lib/review-db";
import { getContact } from "@/lib/contact-store";
import { contactIdPattern } from "@/lib/contact-validation";
import { getReview } from "@/lib/review-store";
import { callSidPattern } from "@/lib/review-validation";
import { callingCountries, normalizeDialingNumber } from "@/lib/calling-countries";

export const metadata: Metadata = {
  title: "Private call console",
  description: "Protected VeilCall browser voice workspace.",
  robots: { index: false, follow: false },
};

export default async function ConsolePage({ searchParams }: { searchParams:Promise<{contact?:string | string[];callback?:string | string[]}> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=%2Fconsole");
  if (!isApprovedOperator(userId)) return <Unauthorized userId={userId} />;
  const status = getVoiceConfigStatus();
  const {contact:id,callback}=await searchParams;
  let initialContact;
  let contactError;
  if (id) {
    try {
      if (typeof id !== "string" || !contactIdPattern.test(id)) throw new Error();
      const saved=await getContact(id,userId);
      if (!saved) throw new Error();
      initialContact={id:saved.id,name:saved.name,phone:saved.phone,country:saved.country};
    } catch { contactError="This contact could not be loaded. Choose another contact or enter the number manually."; }
  }
  else if (callback) {
    try {
      if (typeof callback!=="string" || !callSidPattern.test(callback)) throw new Error();
      const call=await getReview(callback,userId);
      const country=callingCountries.find((item)=>item.code===call?.country)?.code;
      if (!call || !country || !normalizeDialingNumber(call.to,country)) throw new Error();
      initialContact={id:call.callSid,name:call.to,phone:call.to,country};
    } catch {contactError="This callback could not be loaded. Choose another follow-up or enter the number manually.";}
  }
  return <CallWorkspace configured={status.ready} setupIssues={status.missing} callerIds={status.callerIds} reviewEnabled={reviewStorageConfigured()} recordingEnabled={reviewStorageConfigured() && process.env.VOICE_RECORDING_ENABLED === "true"} initialContact={initialContact} contactError={contactError}/>;
}
