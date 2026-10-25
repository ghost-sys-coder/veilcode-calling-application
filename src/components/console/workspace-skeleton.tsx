import {Card,CardContent,CardHeader} from '@/components/ui/card';
import {Skeleton} from '@/components/ui/skeleton';

export function WorkspaceSkeleton({variant='table',label='Loading workspace',rows=5}:{variant?:'dashboard'|'billing'|'table'|'detail';label?:string;rows?:number}){
  return <div className={`workspace-skeleton workspace-skeleton-${variant} grid w-full gap-6`} role="status" aria-label={label} aria-busy="true"><span className="sr-only">{label}</span>
    {(variant==='dashboard'||variant==='billing')&&<div className={`workspace-skeleton-metrics grid gap-4 ${variant==='dashboard'?'grid-cols-2 lg:grid-cols-5':'grid-cols-1 md:grid-cols-2'}`}>{Array.from({length:variant==='dashboard'?5:2},(_,index)=><Card key={index}><CardHeader><Skeleton className="h-3 w-28"/></CardHeader><CardContent><Skeleton className="h-9 w-24"/><Skeleton className="mt-4 h-3 w-36 max-w-full"/></CardContent></Card>)}</div>}
    <Card className="workspace-skeleton-panel"><CardHeader><Skeleton className="h-4 w-40"/><Skeleton className="mt-1 h-3 w-64 max-w-full"/></CardHeader><CardContent><div className="workspace-skeleton-rows grid">{Array.from({length:variant==='detail'?3:rows},(_,index)=><div className="workspace-skeleton-row flex items-center gap-3.5 py-4 first:pt-0 last:pb-0" key={index}><Skeleton className="size-9 shrink-0 rounded-lg"/><div className="min-w-0 flex-1"><Skeleton className="h-3 w-32 max-w-full"/><Skeleton className="mt-2 h-2.5 w-20"/></div><Skeleton className="h-6 w-16 shrink-0"/></div>)}</div></CardContent></Card>
  </div>;
}
