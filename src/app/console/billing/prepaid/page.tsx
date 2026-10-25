import type {Metadata} from 'next';
import {auth} from '@clerk/nextjs/server';
import {redirect} from 'next/navigation';
import {isNumberAdmin} from '@/lib/number-access';
import {requirePrepaidTestEnvironment} from '@/lib/prepaid-config';
import {PrepaidWorkbench} from '@/components/console/prepaid-workbench';
export const metadata:Metadata={title:'Prepaid dialing test',robots:{index:false,follow:false}};
export default async function PrepaidPage(){
  const {userId}=await auth();if(!userId)redirect('/sign-in');if(!isNumberAdmin(userId))redirect('/console/billing');
  try{requirePrepaidTestEnvironment();}catch{redirect('/console/billing');}
  return <PrepaidWorkbench/>;
}
