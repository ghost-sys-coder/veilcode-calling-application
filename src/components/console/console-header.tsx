import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { BrandMark } from "@/components/landing/brand-mark";

export function ConsoleHeader() {
  return <header className="dialer-header">
    <div className="shell dialer-header-inner">
      <BrandMark />
      <div className="dialer-header-right">
        <span className="dialer-private"><ShieldCheck size={15}/> PRIVATE CALLING SPACE</span>
        <Link href="/" className="dialer-site-link">Website <ArrowUpRight size={14}/></Link>
        <UserButton />
      </div>
    </div>
  </header>;
}
