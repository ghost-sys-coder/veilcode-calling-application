"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Phone, CreditCard, LockKeyhole } from "lucide-react";
import { consoleDestinationActive, consoleDestinations } from "@/lib/console-navigation";
import { useCompactNavigation } from "@/hooks/use-compact-navigation";
import { BrandMark } from "@/components/landing/brand-mark";
import { CallbackSidebarCount } from "@/components/console/callback-reminders";
import { WorkspaceMenu } from "@/components/console/workspace-menu";
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
    <SidebarHeader className="workspace-sidebar-brand"><BrandMark /><p className="workspace-brand-caption">Your calling workspace</p></SidebarHeader>
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
      <SidebarGroup className="workspace-account-group"><SidebarGroupLabel>Account</SidebarGroupLabel><nav aria-label="Account navigation"><SidebarMenu>
        <SidebarMenuItem><SidebarMenuButton asChild isActive={pathname==='/console/numbers'} tooltip="My phone numbers"><Link href="/console/numbers" aria-current={pathname==='/console/numbers'?'page':undefined}><Phone aria-hidden="true"/><span>My phone numbers</span></Link></SidebarMenuButton></SidebarMenuItem>
        <SidebarMenuItem><SidebarMenuButton asChild isActive={pathname.startsWith('/console/billing')} tooltip="Billing & credit"><Link href="/console/billing" aria-current={pathname.startsWith('/console/billing')?'page':undefined}><CreditCard aria-hidden="true"/><span>Billing & credit</span></Link></SidebarMenuButton></SidebarMenuItem>
      </SidebarMenu></nav></SidebarGroup>
    </SidebarContent>
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem><WorkspaceMenu admin={admin} sidebar/></SidebarMenuItem>
      </SidebarMenu>
      <div className="workspace-private-note"><LockKeyhole size={13} aria-hidden="true"/><span>Private by design</span></div>
    </SidebarFooter>
    <SidebarRail />
  </Sidebar>;
}
