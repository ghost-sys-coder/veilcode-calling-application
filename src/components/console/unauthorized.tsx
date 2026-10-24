import Link from "next/link";
import { LockKeyhole, ArrowLeft } from "lucide-react";
import { SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/landing/brand-mark";

export function Unauthorized() {
  return <div className="console-blocked">
    <header className="console-top shell"><BrandMark /><Link href="/"><ArrowLeft size={16}/> Main site</Link></header>
    <main className="console-blocked-main shell">
      <div className="console-blocked-symbol"><LockKeyhole size={30} /></div>
      <div className="section-tag"><span className="orange-square" /> OPERATOR PERMISSION REQUIRED</div>
      <h1>Signed in.<br/><em>Not yet authorized.</em></h1>
      <p>Your account is ready for setup. Add your business details and request your own calling number while your calling access is reviewed.</p>
      <Button asChild><Link href="/onboarding">Set up your calling number</Link></Button>
      <SignOutButton><Button type="button" className="vc-button vc-button-primary vc-button-md">Sign out</Button></SignOutButton>
    </main>
  </div>;
}
