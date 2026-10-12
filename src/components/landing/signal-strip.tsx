import { ArrowUpRight } from "lucide-react";

export function SignalStrip() {
  return (
    <section className="signal-strip" aria-label="VeilCall highlights">
      <div className="shell signal-inner">
        <span className="signal-opening">DESIGNED FOR BETTER REACH <ArrowUpRight size={16} /></span>
        <div className="signal-items"><span><i /> BROWSER FIRST</span><span><i /> US CALLER IDENTITY</span><span><i /> TWILIO POWERED</span></div>
        <span className="signal-ending">01 — 03</span>
      </div>
    </section>
  );
}
