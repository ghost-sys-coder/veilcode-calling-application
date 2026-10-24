import { CalendarClock, History, LayoutDashboard, Phone, Users } from "lucide-react";

export const consoleDestinations = [
  { href:"/console/dashboard",label:"Dashboard",mobileLabel:"Overview",icon:LayoutDashboard },
  { href:"/console",label:"Dialer",mobileLabel:"Dialer",icon:Phone },
  { href:"/console/history",label:"Call history",mobileLabel:"History",icon:History },
  { href:"/console/contacts",label:"Contacts",mobileLabel:"Contacts",icon:Users },
  { href:"/console/followups",label:"Follow-ups",mobileLabel:"Follow-ups",icon:CalendarClock },
] as const;

export function consoleDestinationActive(pathname:string,href:string) {
  return pathname===href || (href!=="/console" && pathname.startsWith(`${href}/`));
}
