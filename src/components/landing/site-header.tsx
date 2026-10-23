import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/landing/brand-mark";
import { MobileMenu } from "@/components/landing/mobile-menu";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <BrandMark />
        <nav className="desktop-nav" aria-label="Main navigation">
          <Link href="#why-veilcall">Why VeilCall</Link>
          <Link href="#how-it-works">How it works</Link>
          <Link href="#roadmap">The roadmap</Link>
        </nav>
        <div className="header-actions">
          <span className="header-status"><span className="tiny-signal" /> PRIVATE BETA</span>
          <SignedOut><Link href="/sign-in" className="header-signin">Sign in</Link></SignedOut>
          <Button asChild size="sm" variant="default" className="header-console vc-button vc-button-primary vc-button-sm">
            <Link href="/console" prefetch={false}>Open console <ArrowUpRight size={16} /></Link>
          </Button>
          <SignedIn><UserButton /></SignedIn>
        </div>
        <MobileMenu />
      </div>
    </header>
  );
}
