import { ArrowUpRight, Fingerprint, Headphones, Layers3 } from "lucide-react";

const features = [
  { number: "01", icon: Fingerprint, title: "One recognizable identity.", copy: "Your conversations should start with a consistent business number, not an unfamiliar international caller ID.", tag: "BUSINESS PRESENCE" },
  { number: "02", icon: Headphones, title: "Your browser is the desk.", copy: "No local international calling bundle to manage. The planned voice connection travels over your internet connection to Twilio.", tag: "SIMPLER OUTREACH" },
  { number: "03", icon: Layers3, title: "Room to grow.", copy: "A focused calling experience first. Call activity, notes, contacts, and reporting can follow once the core voice flow is proven.", tag: "INTENTIONAL SCALE" },
];

export function ValueSection() {
  return (
    <section id="why-veilcall" className="value-section section-pad" aria-labelledby="value-heading">
      <div className="shell">
        <div className="section-intro value-intro">
          <div className="section-tag"><span className="orange-square" /> THE THINKING BEHIND IT <span className="section-index">01 / 03</span></div>
          <div><h2 id="value-heading">The distance is real.<br /><em>The friction doesn&apos;t have to be.</em></h2><p>It should feel straightforward to reach a prospective client on the other side of the world. VeilCall is being built around exactly that.</p></div>
        </div>
        <div className="feature-grid">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article className="feature-card" key={feature.number}>
                <div className="feature-card-top"><span>{feature.number} / CAPABILITY</span><ArrowUpRight size={18} /></div>
                <div className="feature-icon"><Icon size={26} strokeWidth={1.5} /></div>
                <h3>{feature.title}</h3>
                <p>{feature.copy}</p>
                <div className="feature-footer">{feature.tag}</div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
