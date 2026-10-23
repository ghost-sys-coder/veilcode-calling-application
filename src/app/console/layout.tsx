import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { isApprovedOperator } from "@/lib/access";
import { ConsoleShell } from "@/components/console/console-shell";

export default async function ConsoleLayout({ children }: { children:React.ReactNode }) {
  const { userId } = await auth();
  // Pages retain their existing redirect and unauthorized states.
  if (!userId || !isApprovedOperator(userId)) return children;
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  return <ConsoleShell defaultOpen={defaultOpen}>{children}</ConsoleShell>;
}
