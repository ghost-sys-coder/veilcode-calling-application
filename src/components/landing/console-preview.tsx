import { ArrowUpRight, AudioLines, Globe2, Mic2, MoreHorizontal, Phone, Radio, SignalHigh, Volume2 } from "lucide-react";

export function ConsolePreview() {
  return (
    <div className="preview-frame" aria-label="Concept preview of the VeilCall console">
      <div className="preview-topbar">
        <div className="preview-title-group">
          <span className="mini-symbol" aria-hidden="true">V</span>
          <span>VEILCALL <span className="preview-subname">/ WORKSPACE</span></span>
        </div>
        <span className="preview-tag">DESIGN PREVIEW</span>
      </div>
      <div className="preview-content">
        <div className="preview-sidebar">
          <div className="preview-side-caption">YOUR SPACE</div>
          <div className="preview-side-active"><Radio size={15} strokeWidth={1.8} /> Dialer <span className="sidebar-active-dot" /></div>
          <div className="preview-side-link"><AudioLines size={15} /> Activity</div>
          <div className="preview-side-link"><Globe2 size={15} /> Contacts</div>
          <div className="preview-sidebar-bottom">
            <span className="preview-avatar">V</span>
            <span><strong>VeilCode Studio</strong><small>Private workspace</small></span>
            <MoreHorizontal size={15} />
          </div>
        </div>
        <div className="preview-main">
          <div className="preview-main-header">
            <div><span className="preview-eyebrow">OUTBOUND CALLING</span><h3>Your call desk<span>.</span></h3></div>
            <span className="preview-location"><span className="location-point" /> UNITED STATES</span>
          </div>
          <div className="preview-call-panel">
            <div className="preview-call-meta"><span><span className="call-meta-dot" /> READY STATE</span><span>001 / 001</span></div>
            <div className="preview-orbit">
              <div className="orbit-ring orbit-ring-outer" />
              <div className="orbit-ring orbit-ring-middle" />
              <div className="orbit-ring orbit-ring-inner" />
              <div className="orbit-core"><Phone size={28} strokeWidth={1.65} /></div>
              <span className="orbit-cross orbit-cross-a">+</span>
              <span className="orbit-cross orbit-cross-b">+</span>
            </div>
            <span className="call-type">NEW OUTBOUND CALL</span>
            <h4>Start a conversation.</h4>
            <p>Your next opportunity begins here.</p>
            <div className="number-display"><span>+1</span><strong>(555) 010-0182</strong><span className="demo-number-label">EXAMPLE</span></div>
            <div className="preview-controls" aria-label="Concept illustration of future call controls">
              <span className="control-round"><Mic2 size={18} /></span>
              <span className="control-round"><Volume2 size={18} /></span>
              <span className="call-demo-button"><Phone size={18} fill="currentColor" /> <span>CALL</span></span>
              <span className="control-round"><MoreHorizontal size={19} /></span>
            </div>
          </div>
          <div className="preview-footer-row"><span><SignalHigh size={15} /> Browser audio</span><span><Globe2 size={15} /> US caller identity</span><span className="preview-footer-arrow"><ArrowUpRight size={17} /></span></div>
        </div>
      </div>
      <div className="preview-base"><span>MADE FOR THE MOMENT YOU PRESS CALL</span><span><span className="tiny-orange-dot" /> NOT YET CONNECTED</span></div>
    </div>
  );
}
