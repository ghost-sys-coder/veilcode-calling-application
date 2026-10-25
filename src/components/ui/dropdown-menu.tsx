'use client';
import * as React from 'react';
import {DropdownMenu as Primitive} from 'radix-ui';
import {cn} from '@/lib/utils';

const DropdownMenu=Primitive.Root;
const DropdownMenuTrigger=Primitive.Trigger;
const DropdownMenuGroup=Primitive.Group;
function DropdownMenuContent({className,sideOffset=8,...props}:React.ComponentProps<typeof Primitive.Content>){
  return <Primitive.Portal><Primitive.Content data-slot="dropdown-menu-content" sideOffset={sideOffset} className={cn('z-50 min-w-56 max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',className)} {...props}/></Primitive.Portal>;
}
function DropdownMenuItem({className,...props}:React.ComponentProps<typeof Primitive.Item>){return <Primitive.Item data-slot="dropdown-menu-item" className={cn('relative flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm outline-none select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0',className)} {...props}/>;}
function DropdownMenuLabel({className,...props}:React.ComponentProps<typeof Primitive.Label>){return <Primitive.Label data-slot="dropdown-menu-label" className={cn('px-3 pt-3 pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground',className)} {...props}/>;}
function DropdownMenuSeparator({className,...props}:React.ComponentProps<typeof Primitive.Separator>){return <Primitive.Separator data-slot="dropdown-menu-separator" className={cn('my-1.5 h-px bg-border',className)} {...props}/>;}
export {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem,DropdownMenuLabel,DropdownMenuSeparator,DropdownMenuGroup};
