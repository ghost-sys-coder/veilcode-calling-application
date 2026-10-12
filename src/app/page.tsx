import { SiteHeader } from "@/components/landing/site-header";
import { Hero } from "@/components/landing/hero";
import { SignalStrip } from "@/components/landing/signal-strip";
import { ValueSection } from "@/components/landing/value-section";
import { StepsSection } from "@/components/landing/steps-section";
import { RoadmapSection } from "@/components/landing/roadmap-section";
import { SiteFooter } from "@/components/landing/site-footer";

export default function HomePage() {
  return (
    <>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <SiteHeader />
      <main id="main-content">
        <Hero />
        <SignalStrip />
        <ValueSection />
        <StepsSection />
        <RoadmapSection />
      </main>
      <SiteFooter />
    </>
  );
}
