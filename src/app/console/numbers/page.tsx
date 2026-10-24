import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { operatorHasAccess as isApprovedOperator } from "@/lib/access";
import { NumberOnboarding } from "@/components/console/number-onboarding";
export const metadata:Metadata={title:"Phone numbers",robots:{index:false,follow:false}};
export default async function NumbersPage() {
  const {userId}=await auth();if(!userId)redirect("/sign-in?redirect_url=%2Fconsole%2Fnumbers");
  if(!(await isApprovedOperator(userId)))redirect("/onboarding");return <NumberOnboarding/>;
}
