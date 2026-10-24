import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isNumberAdmin } from "@/lib/number-access";
import { CustomerAdmin } from "@/components/console/customer-admin";
export const metadata:Metadata={title:"Customer access",robots:{index:false,follow:false}};
export default async function CustomersPage(){const {userId}=await auth();if(!userId)redirect("/sign-in");if(!isNumberAdmin(userId))redirect("/onboarding");return <CustomerAdmin/>;}
