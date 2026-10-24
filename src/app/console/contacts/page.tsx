import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isApprovedOperator } from "@/lib/access";
import { reviewStorageConfigured } from "@/lib/review-db";
import { Unauthorized } from "@/components/console/unauthorized";
import { ContactsWorkspace } from "@/components/console/contacts-workspace";
export const metadata:Metadata={title:"Contacts",robots:{index:false,follow:false}};
export default async function ContactsPage() {
  const {userId}=await auth();
  if (!userId) redirect("/sign-in?redirect_url=%2Fconsole%2Fcontacts");
  if (!isApprovedOperator(userId)) return <Unauthorized/>;
  return <ContactsWorkspace configured={reviewStorageConfigured()}/>;
}
