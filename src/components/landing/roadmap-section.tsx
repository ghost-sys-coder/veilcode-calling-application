import Link from "next/link";
import { ArrowUpRight, Check, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";

const roadmap = [
  { number: "01", name: "Visual foundation", detail: "Responsive landing page and product system", done: true },
  { number: "02", name: "Outbound calling", detail: "Secure Twilio browser dialer and US caller ID", done: false },
  { number: "03", name: "Everyday workflow", detail: "History, contacts, notes, and call insights", done: false },
];

export function RoadmapSection() {
  return (
    <section id="roadmap" className="roadmap-section section-pad" aria-labelledby="roadmap-heading">
      <div className="shell roadmap-grid">
        <div className="roadmap-copy">
          <div className="section-tag"><span className="orange-square" /> AN INTENTIONAL BUILD <span className="section-index">03 / 03</span></div>
          <h2 id="roadmap-heading">The important part<br />comes <em>next.</em></h2>
          <p>We&apos;re building VeilCall in the right order. A clear product first, working calls immediately after, and supporting tools when there&apos;s a reason to add them.</p>
          <Button asChild size="lg" className="vc-button vc-button-primary vc-button-lg"><Link href="/console">View call console <ArrowUpRight size={19} /></Link></Button>
          <span className="roadmap-aside">CURRENT RELEASE · INTERFACE FOUNDATION</span>
        </div>
        <div className="roadmap-panel" role="list" aria-label="Product development phases">
          <div className="roadmap-panel-head"><span>DEVELOPMENT SEQUENCE</span><span>01 — 03</span></div>
          {roadmap.map((item) => (
            <div className="roadmap-item" role="listitem" key={item.number}>
              <span className="roadmap-number">{item.number}</span>
              <div><h3>{item.name}</h3><p>{item.detail}</p></div>
              <span className={`roadmap-state${item.done ? " roadmap-state-done" : ""}`} aria-label={item.done ? "Included in this delivery" : "Planned"}>
                {item.done ? <Check size={19} /> : <Circle size={18} />}
              </span>
            </div>
          ))}
          <div className="roadmap-panel-bottom"><span><span className="roadmap-beacon" /> BUILDING IN SEQUENCE</span><span>VEILCALL / 2026</span></div>
        </div>
      </div>
    </section>
  );
}
