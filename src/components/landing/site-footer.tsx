import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { BrandMark } from "@/components/landing/brand-mark";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell">
        <div className="footer-main"><div><BrandMark /><p>Made to make the next call feel easier.</p></div><Link href="/console">THE WORKSPACE <ArrowUpRight size={17}/></Link></div>
        <div className="footer-bottom"><span>© {new Date().getFullYear()} VEILCODE STUDIO. ALL RIGHTS RESERVED.</span><span>CONCEIVED FOR CONNECTION. BUILT WITH INTENT.</span><Link href="https://veilcode.studio" target="_blank" rel="noopener noreferrer">VEILCODE STUDIO <ArrowUpRight size={13}/></Link></div>
      </div>
    </footer>
  );
}
