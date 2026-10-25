import * as React from 'react';
import {cva,type VariantProps} from 'class-variance-authority';
import {Slot} from 'radix-ui';
import {cn} from '@/lib/utils';

const badgeVariants=cva('inline-flex w-fit shrink-0 items-center justify-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium leading-5 whitespace-nowrap [&>svg]:size-3 [&>svg]:shrink-0',{
  variants:{variant:{default:'border-transparent bg-primary text-primary-foreground',secondary:'border-transparent bg-secondary text-secondary-foreground',outline:'border-border bg-card text-muted-foreground',warning:'border-transparent bg-amber-50 text-amber-800',destructive:'border-transparent bg-destructive/10 text-destructive'}},defaultVariants:{variant:'secondary'},
});
function Badge({className,variant,asChild=false,...props}:React.ComponentProps<'span'>&VariantProps<typeof badgeVariants>&{asChild?:boolean}){
  const Comp=asChild?Slot.Root:'span';
  return <Comp data-slot="badge" data-variant={variant??'secondary'} className={cn(badgeVariants({variant}),className)} {...props}/>;
}
export {Badge,badgeVariants};
