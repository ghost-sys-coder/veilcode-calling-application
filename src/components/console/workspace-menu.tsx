'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {ArrowUpRight,ChartNoAxesCombined,ChevronUp,CreditCard,FileCheck2,Phone,Settings2,ShieldCheck,Users} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuLabel,DropdownMenuSeparator,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {SidebarMenuButton,useSidebar} from '@/components/ui/sidebar';

const adminLinks=[
  {href:'/console/customers',label:'Customer access',icon:Users},
  {href:'/console/numbers/review',label:'Number requests',icon:FileCheck2},
  {href:'/console/costs',label:'Call costs',icon:ChartNoAxesCombined},
];
export function WorkspaceMenu({admin=false,sidebar=false}:{admin?:boolean;sidebar?:boolean}){
  const pathname=usePathname(),{state,setOpenMobile}=useSidebar();
  const active=admin&&adminLinks.some(item=>pathname.startsWith(item.href));
  const item=(href:string,label:string,Icon:typeof Users)=><DropdownMenuItem key={href} asChild><Link href={href} aria-current={pathname===href?'page':undefined} onClick={()=>setOpenMobile(false)}><Icon aria-hidden="true"/>{label}{pathname===href&&<span className="menu-current-indicator" aria-hidden="true"/>}</Link></DropdownMenuItem>;
  return <DropdownMenu><DropdownMenuTrigger asChild>
    {sidebar?<SidebarMenuButton isActive={active} tooltip={admin?'Administration':'More options'} className="workspace-menu-trigger"><Settings2 aria-hidden="true"/><span>{admin?'Administration':'More options'}</span><ChevronUp className="ml-auto" aria-hidden="true"/></SidebarMenuButton>
      :<Button variant="ghost" size="icon" className="workspace-menu-header" aria-label="Workspace menu"><Settings2 aria-hidden="true"/></Button>}
  </DropdownMenuTrigger><DropdownMenuContent side={sidebar?(state==='collapsed'?'right':'top'):'bottom'} align={sidebar?'start':'end'} className="workspace-navigation-menu">
    {!sidebar&&<><DropdownMenuLabel>Account</DropdownMenuLabel>{item('/console/billing','Billing & credit',CreditCard)}{item('/console/numbers','My phone numbers',Phone)}<DropdownMenuSeparator/></>}
    {admin&&<><DropdownMenuLabel>Administration</DropdownMenuLabel>{adminLinks.slice(0,2).map(link=>item(link.href,link.label,link.icon))}<DropdownMenuLabel>Operations</DropdownMenuLabel>{item('/console/costs','Call costs',ChartNoAxesCombined)}{item('/console/billing#pilot-setup','Billing controls',ShieldCheck)}<DropdownMenuSeparator/></>}
    <DropdownMenuLabel>VeilCall</DropdownMenuLabel>{item('/legal/terms','Service policies',FileCheck2)}{item('/','Visit website',ArrowUpRight)}
  </DropdownMenuContent></DropdownMenu>;
}
