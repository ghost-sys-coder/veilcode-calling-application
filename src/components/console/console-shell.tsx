"use client";

import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { AppSidebar } from "@/components/console/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { CallbackReminderProvider, CallbackReminderNotice, CallbackReminders } from "@/components/console/callback-reminders";

export function ConsoleShell({ children, defaultOpen = true }: { children:React.ReactNode; defaultOpen?:boolean }) {
  const pathname = usePathname();
  return <CallbackReminderProvider><SidebarProvider defaultOpen={defaultOpen} className="workspace-shell" style={{ "--sidebar-width":"15rem" } as React.CSSProperties}>
    <AppSidebar />
    <SidebarInset className="workspace-main">
      <header className="workspace-header">
        <div className="workspace-header-title"><SidebarTrigger /><Separator orientation="vertical" className="h-4"/>
          <span>{pathname === "/console/dashboard" ? "Dashboard" : pathname === "/console/history" ? "Call history" : pathname === "/console/contacts" ? "Contacts" : pathname === "/console/followups" ? "Follow-ups" : "Dialer"}</span>
        </div>
        <div className="workspace-account"><CallbackReminders /><UserButton /></div>
      </header>
      <CallbackReminderNotice />{children}
    </SidebarInset>
  </SidebarProvider></CallbackReminderProvider>;
}
