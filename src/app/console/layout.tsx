import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { operatorHasAccess as isApprovedOperator } from "@/lib/access";
import { ConsoleShell } from "@/components/console/console-shell";
import { isNumberAdmin } from "@/lib/number-access";

export default async function ConsoleLayout({ children }: { children:React.ReactNode }) {
  const { userId } = await auth();
  // Pages retain their existing redirect and unauthorized states.
  if (!userId || !(await isApprovedOperator(userId))) return children;
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  return <ConsoleShell key={userId} defaultOpen={defaultOpen} admin={isNumberAdmin(userId)}>{children}</ConsoleShell>;
}
