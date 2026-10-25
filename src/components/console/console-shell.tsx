"use client";

import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { Phone, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "@/components/console/app-sidebar";
import { MobileNavigation } from "@/components/console/mobile-navigation";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { CallbackReminderProvider, CallbackReminderNotice, CallbackReminders } from "@/components/console/callback-reminders";

export function ConsoleShell({ children, defaultOpen = true, admin=false }: { children:React.ReactNode; defaultOpen?:boolean;admin?:boolean }) {
  const pathname = usePathname();
  return <CallbackReminderProvider><SidebarProvider defaultOpen={defaultOpen} className="workspace-shell" style={{ "--sidebar-width":"15rem" } as React.CSSProperties}>
    <AppSidebar admin={admin}/>
    <SidebarInset className="workspace-main">
      <header className="workspace-header">
        <div className="workspace-header-title"><div className="workspace-sidebar-toggle"><SidebarTrigger /><Separator orientation="vertical" className="h-4"/></div>
          <span>{pathname.startsWith("/console/costs") ? "Call costs" : pathname.startsWith("/console/billing") ? "Billing" : pathname.startsWith("/console/customers") ? "Customer access" : pathname.startsWith("/console/numbers") ? "Phone numbers" : pathname === "/console/dashboard" ? "Dashboard" : pathname === "/console/history" ? "Call history" : pathname === "/console/contacts" ? "Contacts" : pathname === "/console/followups" ? "Follow-ups" : "Dialer"}</span>
        </div>
        <div className="workspace-account"><Button asChild variant="ghost" size="icon" className="workspace-numbers-link"><Link href="/console/billing" aria-label="Billing and credit" title="Billing and credit"><CreditCard aria-hidden="true"/></Link></Button><Button asChild variant="ghost" size="icon" className="workspace-numbers-link"><Link href="/console/numbers" aria-label="Your phone numbers" title="Your phone numbers"><Phone aria-hidden="true"/></Link></Button><CallbackReminders /><UserButton /></div>
      </header>
      <CallbackReminderNotice />{children}
    </SidebarInset>
    <MobileNavigation />
  </SidebarProvider></CallbackReminderProvider>;
}
