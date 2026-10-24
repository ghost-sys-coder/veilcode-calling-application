import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { operatorHasAccess } from "@/lib/access";
import { BillingWorkspace } from "@/components/console/billing-workspace";
export const metadata:Metadata={title:"Billing & calling credit",robots:{index:false,follow:false}};
export default async function BillingPage(){const {userId}=await auth();if(!userId)redirect("/sign-in?redirect_url=%2Fconsole%2Fbilling");if(!await operatorHasAccess(userId))redirect("/onboarding");return <BillingWorkspace/>;}
