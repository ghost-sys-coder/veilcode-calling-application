import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/landing/brand-mark";

interface AuthShellProps { heading: string; eyebrow: string; children: React.ReactNode }

export function AuthShell({ heading, eyebrow, children }: AuthShellProps) {
  return <main className="auth-screen">
    <div className="auth-screen-bar shell"><BrandMark /><Link href="/"><ArrowLeft size={16} /> Back to the site</Link></div>
    <div className="auth-screen-grid shell">
      <section className="auth-screen-copy">
        <div className="section-tag"><span className="orange-square" /> {eyebrow}</div>
        <h1>{heading}</h1>
        <p>One workspace. Your professional number. Calls handled with intention.</p>
        <div className="auth-secure-note"><ShieldCheck size={21} /> Only approved operators may place calls.</div>
      </section>
      <section className="auth-screen-card" aria-label="Account access">{children}</section>
    </div>
  </main>;
}
