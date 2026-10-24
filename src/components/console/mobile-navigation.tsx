"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavigationMenu, NavigationMenuItem, NavigationMenuLink, NavigationMenuList } from "@/components/ui/navigation-menu";
import { CallbackSidebarCount } from "@/components/console/callback-reminders";
import { consoleDestinationActive, consoleDestinations } from "@/lib/console-navigation";

export function MobileNavigation() {
  const pathname=usePathname();
  return <div className="mobile-navigation-container">
    <NavigationMenu viewport={false} className="workspace-bottom-navigation" aria-label="Workspace navigation">
      <NavigationMenuList>
        {consoleDestinations.map(({href,label,mobileLabel,icon:Icon})=>{
          const active=consoleDestinationActive(pathname,href);
          return <NavigationMenuItem key={href}>
            <NavigationMenuLink asChild active={active} className="mobile-navigation-link">
              <Link href={href} aria-current={active ? "page" : undefined} title={label}>
                <span className="mobile-navigation-icon"><Icon aria-hidden="true" strokeWidth={active ? 2.2 : 1.7}/>
                  {href==="/console/followups" && <CallbackSidebarCount className="mobile-navigation-count"/>}
                </span>
                <span className="mobile-navigation-label">{mobileLabel}</span>
              </Link>
            </NavigationMenuLink>
          </NavigationMenuItem>;
        })}
      </NavigationMenuList>
    </NavigationMenu>
  </div>;
}
