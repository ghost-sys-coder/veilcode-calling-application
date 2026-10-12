import Link from "next/link";
import { LockKeyhole, ArrowLeft } from "lucide-react";
import { SignOutButton } from "@clerk/nextjs";
import { BrandMark } from "@/components/landing/brand-mark";

export function Unauthorized({ userId }: { userId: string }) {
  return <div className="console-blocked">
    <header className="console-top shell"><BrandMark /><Link href="/"><ArrowLeft size={16}/> Main site</Link></header>
    <main className="console-blocked-main shell">
      <div className="console-blocked-symbol"><LockKeyhole size={30} /></div>
      <div className="section-tag"><span className="orange-square" /> OPERATOR PERMISSION REQUIRED</div>
      <h1>Signed in.<br/><em>Not yet authorized.</em></h1>
      <p>Your Clerk account is valid. Calling privileges are intentionally disabled until your user ID is added to the server allowlist.</p>
      <div className="console-id">CLERK USER ID <code>{userId}</code></div>
      <p>Add this exact ID to <code>CLERK_ALLOWED_USER_IDS</code> in <code>.env.local</code>, restart the app, and return to the console.</p>
      <SignOutButton><button type="button" className="vc-button vc-button-primary vc-button-md">Sign out</button></SignOutButton>
    </main>
  </div>;
}
