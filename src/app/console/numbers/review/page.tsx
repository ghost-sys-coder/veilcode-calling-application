import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isNumberAdmin } from "@/lib/number-access";
import { NumberAdmin } from "@/components/console/number-admin";
export const metadata:Metadata={title:"Review number requests",robots:{index:false,follow:false}};
export default async function NumberReviewPage() {
  const {userId}=await auth();if(!userId)redirect("/sign-in?redirect_url=%2Fconsole%2Fnumbers%2Freview");
  if(!isNumberAdmin(userId))redirect("/onboarding");return <NumberAdmin/>;
}
