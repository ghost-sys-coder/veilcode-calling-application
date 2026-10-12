import { ArrowRight, Globe2, Laptop2, PhoneOutgoing } from "lucide-react";

const steps = [
  { number: "01", icon: Laptop2, title: "Open your desk", copy: "Sign in to your private console and initiate a call using your computer's microphone and browser." },
  { number: "02", icon: Globe2, title: "Twilio connects it", copy: "The application requests an outbound call. Twilio handles the voice connection and the configured US business caller ID." },
  { number: "03", icon: PhoneOutgoing, title: "Reach the prospect", copy: "The US recipient receives a conventional phone call, with the business caller ID supplied through Twilio." },
];

export function StepsSection() {
  return (
    <section id="how-it-works" className="steps-section section-pad" aria-labelledby="steps-heading">
      <div className="shell">
        <div className="steps-head">
          <div className="section-tag light-tag"><span className="orange-square" /> THE CONNECTION MODEL <span className="section-index">02 / 03</span></div>
          <div><h2 id="steps-heading">Three steps.<br /><span>One direct line.</span></h2><p>This is the intended calling flow for Phase 2. No SIM rerouting, no extra international bundle.</p></div>
        </div>
        <div className="steps-grid">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div className="step" key={step.number}>
                <div className="step-top"><span>{step.number}</span><Icon size={23} strokeWidth={1.5} />{index < steps.length - 1 && <ArrowRight className="step-arrow" size={20} />}</div>
                <h3>{step.title}</h3><p>{step.copy}</p>
              </div>
            );
          })}
        </div>
        <div className="steps-note"><span className="steps-note-mark">*</span><p>Before outbound calling goes live, the application needs Twilio credentials, access control, geographic permissions, and verified calling behavior. The landing page does not initiate calls.</p></div>
      </div>
    </section>
  );
}
