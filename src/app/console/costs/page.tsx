import type {Metadata} from 'next';
import {auth} from '@clerk/nextjs/server';
import {redirect} from 'next/navigation';
import {isNumberAdmin} from '@/lib/number-access';
import {CallCostsWorkspace} from '@/components/console/call-costs-workspace';
export const metadata:Metadata={title:'Call costs',robots:{index:false,follow:false}};
export default async function CallCostsPage(){
  const {userId}=await auth();if(!userId)redirect('/sign-in');if(!isNumberAdmin(userId))redirect('/console/billing');
  return <CallCostsWorkspace/>;
}
