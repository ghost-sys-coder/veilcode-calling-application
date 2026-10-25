import {Skeleton} from '@/components/ui/skeleton';
import {WorkspaceSkeleton} from '@/components/console/workspace-skeleton';
export default function ConsoleLoading(){return <div className="shell console-loading"><div className="console-loading-heading"><Skeleton className="h-3 w-24"/><Skeleton className="mt-3 h-8 w-56 max-w-full"/><Skeleton className="mt-3 h-3 w-80 max-w-full"/></div><WorkspaceSkeleton variant="dashboard"/></div>;}
