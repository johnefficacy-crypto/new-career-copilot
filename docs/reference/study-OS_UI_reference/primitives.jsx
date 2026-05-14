/* Design-system primitives shared across screens */
const { useState } = React;

function Eyebrow({ children, tone }) {
  return <div className={`eyebrow ${tone === 'dark' ? '!text-[#D6BC93]' : ''}`}>{children}</div>;
}

function Pill({ tone = "outline", children, className = "" }) {
  const map = { outline:"pill-outline", sage:"pill-sage", clay:"pill-clay", dusk:"pill-dusk", amber:"pill-amber", ink:"pill-ink", rose:"pill-rose" };
  return <span className={`pill ${map[tone]} ${className}`}>{children}</span>;
}

function Chip({ s }) {
  return <span className={`chip chip-${s.layer}`} title={`${s.layer} intelligence`}>{LayerGlyph(s.layer)} {s.label}</span>;
}
function LayerGlyph(layer) {
  if (layer === "user")   return <span style={{fontWeight:700,opacity:0.7}}>u·</span>;
  if (layer === "exam")   return <span style={{fontWeight:700,opacity:0.7}}>e·</span>;
  if (layer === "update") return <span style={{fontWeight:700,opacity:0.7}}>n·</span>;
  if (layer === "engine") return <span style={{fontWeight:700,opacity:0.7}}>⚙</span>;
  if (layer === "plan")   return <span style={{fontWeight:700,opacity:0.7}}>p·</span>;
  return null;
}

function TrustStamp({ kind, label }) {
  const map = {
    official:    { cls:"stamp-official",    text: label || "Official" },
    aggregator:  { cls:"stamp-aggregator",  text: label || "Aggregator · needs verification" },
    research:    { cls:"stamp-research",    text: label || "Research · not official" },
    opportunity: { cls:"stamp-opportunity", text: label || "Opportunity · matched" },
    verified:    { cls:"stamp-verified",    text: label || "Verified" },
    needs:       { cls:"stamp-needs",       text: label || "Needs verification" },
    locked:      { cls:"stamp-locked",      text: label || "Locked" },
    preview:     { cls:"stamp-preview",     text: label || "Preview" },
    notcon:      { cls:"stamp-notcon",      text: label || "Not connected" },
    live:        { cls:"stamp-live",        text: label || "Live" },
  };
  const m = map[kind] || map.preview;
  return <span className={`stamp ${m.cls}`}>{m.text}</span>;
}

function VerifiedSeal({ size = 22 }) {
  return (
    <span aria-label="Officially verified"
      className="seal-verified inline-flex items-center justify-center rounded-full text-[#F0F5EF]"
      style={{ width:size, height:size, flex:'0 0 auto' }}>
      <svg width={size*0.55} height={size*0.55} viewBox="0 0 16 16" fill="none">
        <path d="M3 8.4 6.4 11.5 13 4.6" stroke="#F0F5EF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function StatusDot({ state, label }) {
  const dot = { live:"sdot-live", partial:"sdot-partial", preview:"sdot-preview", "not-connected":"sdot-not" }[state] || "sdot-preview";
  const text = { live:"Live", partial:"Partially connected", preview:"Preview / static", "not-connected":"Not connected" }[state] || "Preview";
  return (
    <span className="inline-flex items-center gap-2 text-[11px] text-[#6C5038]">
      <span className={`sdot ${dot}`}></span>
      {label || text}
    </span>
  );
}

function Card({ children, className = "", padded = true, screenLabel }) {
  return (
    <section className={`soft-card relative grain overflow-hidden ${className}`} data-screen-label={screenLabel}>
      {padded ? <div className="px-7 py-6">{children}</div> : children}
    </section>
  );
}

function SectionHeader({ eyebrow, title, sub, right, dark }) {
  return (
    <div className="flex items-end justify-between gap-6 mb-4">
      <div>
        {eyebrow && <Eyebrow tone={dark ? 'dark' : ''}>{eyebrow}</Eyebrow>}
        {title && <h2 className={`font-serif text-[26px] mt-1 leading-tight ${dark ? 'text-[#F3EADB]' : 'text-[#2E2218]'}`}>{title}</h2>}
        {sub && <p className={`text-[12.5px] mt-1 max-w-[68ch] ${dark ? 'text-[#D6BC93]' : 'text-[#6C5038]'}`}>{sub}</p>}
      </div>
      {right}
    </div>
  );
}

function ProvenanceChips({ sources }) {
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      <span className="eyebrow !text-[9px] !tracking-[0.18em] mr-1">Generated from</span>
      {sources.map((s,i) => <Chip key={i} s={s} />)}
    </div>
  );
}

function ConfidencePill({ value, evidence }) {
  const pct = Math.round(value * 100);
  const tone = pct >= 85 ? "sage" : pct >= 65 ? "amber" : "rose";
  return (
    <span className="inline-flex items-center gap-1.5">
      <Pill tone={tone}>Conf {pct}%</Pill>
      {evidence != null && <span className="num-mono text-[10.5px] text-[#6C5038]">{typeof evidence === 'number' ? `${evidence} evid.` : evidence}</span>}
    </span>
  );
}

function MiniBar({ pct, color = "#54794E", height = 6, width = 120 }) {
  return (
    <div className="bar" style={{height, width}}>
      <i style={{width:`${Math.round(pct*100)}%`, background:color}}></i>
    </div>
  );
}

/* Drawer overlay */
function Drawer({ open, onClose, title, children, width = 480 }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 drawer-bg" onClick={onClose}>
      <div className="absolute right-0 top-0 bottom-0 bg-[#FBF6EF] border-l border-[#E7DECB] shadow-2xl flex flex-col"
           style={{width}} onClick={(e)=>e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-[#E7DECB] flex items-center justify-between">
          <div className="font-serif text-[18px]">{title}</div>
          <button onClick={onClose} className="text-[#6C5038] hover:text-[#2E2218]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div className="flex-1 overflow-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function EvidenceDrawer({ open, onClose, title, items }) {
  return (
    <Drawer open={open} onClose={onClose} title={title || "Evidence"}>
      <div className="space-y-3">
        {(items || []).map((e,i) => (
          <div key={i} className="rounded-xl border border-[#E7DECB] bg-white/60 p-4">
            <div className="flex items-center justify-between">
              <div className="num-mono text-[10.5px] text-[#6C5038]">{e.kind} · {e.id}</div>
              <TrustStamp kind={e.trust || "verified"} />
            </div>
            <div className="text-[13px] mt-1.5">{e.text}</div>
            {e.source && <div className="num-mono text-[10.5px] text-[#6C5038] mt-2">source: {e.source}</div>}
          </div>
        ))}
      </div>
    </Drawer>
  );
}

/* Small reusable header (page-level) */
function PageHeader({ eyebrow, title, sub, right }) {
  return (
    <header className="px-10 pt-9 pb-6 flex items-end justify-between gap-6">
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="text-[36px] mt-2 leading-[1.05]">{title}</h1>
        {sub && <p className="text-[14px] text-[#6C5038] mt-2 max-w-[70ch]">{sub}</p>}
      </div>
      {right}
    </header>
  );
}

/* Inline tab strip */
function Tabs({ value, onChange, options }) {
  return (
    <div className="flex flex-wrap gap-1 bg-[#F3EADB] p-1 rounded-full border border-[#E7DECB] w-fit">
      {options.map(o => (
        <button key={o.value} onClick={()=>onChange(o.value)}
          className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition ${
            value === o.value ? "bg-[#2E2218] text-[#F3EADB]" : "text-[#6C5038] hover:bg-[#E7D6BA]"
          }`}>
          {o.label}{o.badge != null && <span className="ml-1.5 num-mono opacity-70">{o.badge}</span>}
        </button>
      ))}
    </div>
  );
}

/* Empty state */
function EmptyState({ icon, title, body, cta }) {
  return (
    <div className="rounded-xl border border-dashed border-[#D6C9AC] bg-[#FBF8F2] p-8 text-center">
      <div className="text-[28px] mb-2">{icon || "·"}</div>
      <div className="font-serif text-[18px] text-[#2E2218]">{title}</div>
      {body && <div className="text-[12.5px] text-[#6C5038] mt-1.5 max-w-[40ch] mx-auto">{body}</div>}
      {cta}
    </div>
  );
}

Object.assign(window, {
  Eyebrow, Pill, Chip, LayerGlyph, TrustStamp, VerifiedSeal, StatusDot,
  Card, SectionHeader, ProvenanceChips, ConfidencePill, MiniBar,
  Drawer, EvidenceDrawer, PageHeader, Tabs, EmptyState
});
