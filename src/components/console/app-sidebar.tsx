"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, ShieldCheck, Phone, CreditCard, Users, ChartNoAxesCombined } from "lucide-react";
import { consoleDestinationActive, consoleDestinations } from "@/lib/console-navigation";
import { useCompactNavigation } from "@/hooks/use-compact-navigation";
import { BrandMark } from "@/components/landing/brand-mark";
import { CallbackSidebarCount } from "@/components/console/callback-reminders";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail, useSidebar,
} from "@/components/ui/sidebar";

export function AppSidebar({admin=false}:{admin?:boolean}) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const compact=useCompactNavigation();
  if (compact) return null;
  return <Sidebar collapsible="icon" className="workspace-sidebar">
    <SidebarHeader className="workspace-sidebar-brand"><BrandMark /></SidebarHeader>
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Workspace</SidebarGroupLabel>
        <nav aria-label="Workspace navigation">
          <SidebarMenu>
            {consoleDestinations.map(({ href, label, icon: Icon }) => <SidebarMenuItem key={href}>
              <SidebarMenuButton asChild isActive={consoleDestinationActive(pathname,href)} tooltip={label}>
                <Link href={href} aria-current={consoleDestinationActive(pathname,href) ? "page" : undefined} onClick={() => setOpenMobile(false)}>
                  <Icon aria-hidden="true"/><span>{label}</span>
                </Link>
              </SidebarMenuButton>
              {href==="/console/followups" && <CallbackSidebarCount />}
            </SidebarMenuItem>)}
          </SidebarMenu>
        </nav>
      </SidebarGroup>
    </SidebarContent>
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem><SidebarMenuButton asChild isActive={pathname.startsWith("/console/billing")} tooltip="Billing"><Link href="/console/billing"><CreditCard aria-hidden="true"/><span>Billing & credit</span></Link></SidebarMenuButton></SidebarMenuItem>
        {admin && <SidebarMenuItem><SidebarMenuButton asChild isActive={pathname.startsWith("/console/costs")} tooltip="Call costs"><Link href="/console/costs"><ChartNoAxesCombined aria-hidden="true"/><span>Call costs</span></Link></SidebarMenuButton></SidebarMenuItem>}
        {admin && <SidebarMenuItem><SidebarMenuButton asChild isActive={pathname.startsWith("/console/customers")} tooltip="Customer access"><Link href="/console/customers"><Users aria-hidden="true"/><span>Customer access</span></Link></SidebarMenuButton></SidebarMenuItem>}
        <SidebarMenuItem><SidebarMenuButton asChild isActive={pathname.startsWith("/console/numbers")} tooltip="Phone numbers"><Link href="/console/numbers" aria-current={pathname.startsWith("/console/numbers") ? "page" : undefined}><Phone aria-hidden="true"/><span>Phone numbers</span></Link></SidebarMenuButton></SidebarMenuItem>
        <SidebarMenuItem><SidebarMenuButton asChild tooltip="Visit website">
          <Link href="/"><ArrowUpRight aria-hidden="true"/><span>Visit website</span></Link>
        </SidebarMenuButton></SidebarMenuItem>
      </SidebarMenu>
      <div className="workspace-private-note"><ShieldCheck size={16} aria-hidden="true"/><span>Private calling workspace</span></div>
    </SidebarFooter>
    <SidebarRail />
  </Sidebar>;
}
