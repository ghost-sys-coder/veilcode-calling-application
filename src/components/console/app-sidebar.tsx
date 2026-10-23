"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, History, Phone, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/landing/brand-mark";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail, useSidebar,
} from "@/components/ui/sidebar";

const destinations = [
  { href: "/console", label: "Dialer", icon: Phone },
  { href: "/console/history", label: "Call history", icon: History },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  return <Sidebar collapsible="icon" className="workspace-sidebar">
    <SidebarHeader className="workspace-sidebar-brand"><BrandMark /></SidebarHeader>
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Workspace</SidebarGroupLabel>
        <nav aria-label="Workspace navigation">
          <SidebarMenu>
            {destinations.map(({ href, label, icon: Icon }) => <SidebarMenuItem key={href}>
              <SidebarMenuButton asChild isActive={pathname === href} tooltip={label}>
                <Link href={href} aria-current={pathname === href ? "page" : undefined} onClick={() => setOpenMobile(false)}>
                  <Icon aria-hidden="true"/><span>{label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>)}
          </SidebarMenu>
        </nav>
      </SidebarGroup>
    </SidebarContent>
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem><SidebarMenuButton asChild tooltip="Visit website">
          <Link href="/"><ArrowUpRight aria-hidden="true"/><span>Visit website</span></Link>
        </SidebarMenuButton></SidebarMenuItem>
      </SidebarMenu>
      <div className="workspace-private-note"><ShieldCheck size={16} aria-hidden="true"/><span>Private calling workspace</span></div>
    </SidebarFooter>
    <SidebarRail />
  </Sidebar>;
}
