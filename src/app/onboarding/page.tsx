import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { isApprovedOperator } from "@/lib/access";
import { BrandMark } from "@/components/landing/brand-mark";
import { NumberOnboarding } from "@/components/console/number-onboarding";
export const metadata:Metadata={title:"Set up your calling number",robots:{index:false,follow:false}};
export default async function OnboardingPage() {
  const {userId}=await auth();if(!userId)redirect("/sign-in?redirect_url=%2Fonboarding");
  if(isApprovedOperator(userId))redirect("/console/numbers");
  return <><header className="shell number-onboarding-header"><BrandMark/><div><Link href="/">Main site</Link><UserButton/></div></header><NumberOnboarding/></>;
}
