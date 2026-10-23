import { ArrowUpRight, Headphones, LockKeyhole, Signal, Shield, Zap } from "lucide-react";
import { Dialer } from "@/components/console/dialer";
import type { CallerIdOption } from "@/lib/caller-id-types";

export function CallWorkspace({ configured, setupIssues, callerIds, recordingEnabled = false }: {
  configured: boolean; setupIssues: string[]; callerIds: CallerIdOption[]; recordingEnabled?:boolean;
}) {
  return <div className="dialer-page">
    <div className="shell dialer-title-row">
      <div><p className="dialer-eyebrow"><span className="dialer-blink" /> VEILCALL / VOICE TERMINAL 001</p>
      <h1>Good conversations <em>start here.</em></h1>
      <p>Call contacts in the US, Canada, UK, and Australia using one of your approved calling numbers.</p></div>
      <div className="dialer-title-mark"><Signal size={22}/><span>UGANDA <ArrowUpRight size={16}/> US / CANADA / UK / AU</span></div>
    </div>
    <div className="shell dialer-grid">
      <aside className="dialer-aside">
        <div className="dialer-aside-top"><span className="dialer-panel-number">01 / CONTROL ROOM</span><Headphones size={22}/></div>
        <h2>Your voice.<br/>Your number.</h2>
        <p>Audio travels over your internet connection. Twilio completes the telephone call.</p>
        <div className="dialer-aside-line" />
        <div className="dialer-aside-fact"><LockKeyhole size={18}/><span><strong>Restricted access</strong>Authorized operators only</span></div>
        <div className="dialer-aside-fact"><Shield size={18}/><span><strong>Controlled caller ID</strong>Configured on the server</span></div>
        <div className="dialer-aside-fact"><Zap size={18}/><span><strong>US, Canada, UK &amp; Australia</strong>Validated before calling</span></div>
        <span className="dialer-aside-foot">BUILT BY VEILCODE STUDIO <ArrowUpRight size={15}/></span>
      </aside>
      <Dialer configured={configured} setupIssues={setupIssues} callerIds={callerIds} recordingEnabled={recordingEnabled} />
    </div>
    <div className="shell dialer-footnote">Use the service only for lawful outreach. Recipient consent, telemarketing rules, and Twilio charges remain your responsibility.</div>
  </div>;
}
