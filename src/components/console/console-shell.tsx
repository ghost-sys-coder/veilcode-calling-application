"use client";

import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { Phone, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "@/components/console/app-sidebar";
import { MobileNavigation } from "@/components/console/mobile-navigation";
import { WorkspaceMenu } from "@/components/console/workspace-menu";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { CallbackReminderProvider, CallbackReminderNotice, CallbackReminders } from "@/components/console/callback-reminders";

export function ConsoleShell({ children, defaultOpen = true, admin=false }: { children:React.ReactNode; defaultOpen?:boolean;admin?:boolean }) {
  const pathname = usePathname();
  const administration=pathname.startsWith('/console/costs')||pathname.startsWith('/console/customers')||pathname.startsWith('/console/numbers/review');
  const account=pathname.startsWith('/console/billing')||pathname==='/console/numbers';
  return <CallbackReminderProvider><SidebarProvider defaultOpen={defaultOpen} className="workspace-shell" style={{ "--sidebar-width":"15.5rem" } as React.CSSProperties}>
    <AppSidebar admin={admin}/>
    <SidebarInset className="workspace-main">
      <header className="workspace-header">
        <div className="workspace-header-title"><div className="workspace-sidebar-toggle"><SidebarTrigger /><Separator orientation="vertical" className="h-4"/></div>
          <span className="workspace-header-context">{administration?'Administration':account?'Account':'Workspace'}</span><ChevronRight className="workspace-header-chevron" size={13} aria-hidden="true"/>
          <span>{pathname.startsWith("/console/costs") ? "Call costs" : pathname.startsWith("/console/billing") ? "Billing & credit" : pathname.startsWith("/console/customers") ? "Customer access" : pathname.startsWith('/console/numbers/review')?'Number requests':pathname.startsWith("/console/numbers") ? "Phone numbers" : pathname === "/console/dashboard" ? "Overview" : pathname === "/console/history" ? "Call history" : pathname === "/console/contacts" ? "Contacts" : pathname === "/console/followups" ? "Follow-ups" : "Dialer"}</span>
        </div>
        <div className="workspace-account"><Badge variant="outline" className="workspace-private-badge"><span className="workspace-status-dot"/>Private workspace</Badge><Button asChild variant="outline" size="sm" className="workspace-quick-call"><Link href="/console"><Phone aria-hidden="true"/>New call</Link></Button><CallbackReminders /><WorkspaceMenu admin={admin}/><UserButton /></div>
      </header>
      <CallbackReminderNotice />{children}
    </SidebarInset>
    <MobileNavigation />
  </SidebarProvider></CallbackReminderProvider>;
}
