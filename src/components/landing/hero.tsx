import Link from "next/link";
import { ArrowDown, ArrowUpRight, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConsolePreview } from "@/components/landing/console-preview";

export function Hero() {
  return (
    <section className="hero-section" aria-labelledby="hero-title">
      <div className="hero-grid-decoration" aria-hidden="true" />
      <div className="shell hero-inner">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> THE OUTBOUND CALLING WORKSPACE <span className="eyebrow-count">/ 001</span></div>
          <h1 id="hero-title">Be heard.<br /> <span>From anywhere.</span></h1>
          <p className="hero-lede">Your business conversations deserve a better starting point. Call US prospects from your browser, using one familiar US business number.</p>
          <div className="hero-cta-row">
            <Button asChild size="lg" className="vc-button vc-button-primary vc-button-lg">
              <Link href="/console">Enter the console <ArrowUpRight size={19} /></Link>
            </Button>
            <Link className="hero-text-link" href="#how-it-works">See how it works <ChevronRight size={18} /></Link>
          </div>
          <div className="hero-lower">
            <div className="hero-index"><span className="hero-index-square" /><span>DESIGNED FOR<br /><strong>REAL CONVERSATIONS</strong></span></div>
            <Link className="hero-scroll" href="#why-veilcall" aria-label="Scroll to learn more"><ArrowDown size={19} /></Link>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-floating-label"><span>01 / THE EXPERIENCE</span><span>WEB · VOICE · REACH</span></div>
          <ConsolePreview />
          <div className="hero-visual-foot"><span>ONE NUMBER. EVERY INTRODUCTION.</span><span>BUILT BY VEILCODE <ArrowUpRight size={14}/></span></div>
        </div>
      </div>
      <div className="hero-accent-line" />
    </section>
  );
}
