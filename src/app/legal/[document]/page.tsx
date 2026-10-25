import type {Metadata} from 'next';
import Link from 'next/link';
import {auth} from '@clerk/nextjs/server';
import {notFound} from 'next/navigation';
import {isNumberAdmin} from '@/lib/number-access';
import {pilotControl,publiclyReleasedOffer,pilotRelease} from '@/lib/pilot-store';
import {emptyPilotOffer} from '@/lib/pilot-types';
import {policyDocuments,policyEdition,policySections,type PolicyDocument} from '@/lib/legal-policies';
import {Card,CardContent,CardHeader,CardTitle} from '@/components/ui/card';
export const metadata:Metadata={title:'Service policies',robots:{index:false,follow:false}};
export const dynamic='force-dynamic';
export default async function PolicyPage({params,searchParams}:{params:Promise<{document:string}>;searchParams:Promise<{offer?:string}>}){
  const [{document},{offer:offerId},{userId}]=await Promise.all([params,searchParams,auth()]);
  const item=policyDocuments.find(item=>item.key===document);if(!item)notFound();
  const admin=isNumberAdmin(userId);
  if(offerId&&!/^[0-9a-f-]{36}$/.test(offerId))notFound();
  const control=await pilotControl();
  const release=offerId ? (await publiclyReleasedOffer(offerId)??(admin?await pilotRelease(offerId):null)) : admin ? control.draft??control.active : control.active;
  if(!release&&!admin)notFound();
  const config=release?.config??emptyPilotOffer;
  const published=release?Boolean(await publiclyReleasedOffer(release.id)):false;
  const documents=document==='terms'?policyDocuments:policyDocuments.filter(row=>row.key===document);
  return <main className="shell legal-page"><p className="dialer-eyebrow">VEILCALL / SERVICE POLICIES</p><h1>{item.label}</h1>
    {!published&&<p role="status" className="legal-draft">Owner draft — awaiting completed business details and approval. This is not a published customer agreement.</p>}
    <p>Wording edition {release?.policySnapshot.edition??policyEdition} · Offer {release?.id??'not saved'} · Policy revision {config.policies.revision||'draft'}</p>
    <nav aria-label="Policy documents" className="billing-actions">{policyDocuments.map(row=><Link key={row.key} href={`/legal/${row.key}${release?`?offer=${release.id}`:''}`}>{row.label}</Link>)}</nav>
    <p>The Terms page includes all four documents for printing or saving together. Your call quote supplies the destination-specific rate and maximum charge for each call.</p>
    {documents.map(row=><Card key={row.key}><CardHeader><CardTitle>{row.label}</CardTitle></CardHeader><CardContent>{(release?.policySnapshot.documents[row.key]??policySections(row.key as PolicyDocument,config)).map(section=><section key={section.title}><h2>{section.title}</h2>{section.paragraphs.map(paragraph=><p key={paragraph}>{paragraph}</p>)}</section>)}</CardContent></Card>)}
    <p><Link href="/console/billing">Return to Billing & credit</Link></p>
  </main>;
}
