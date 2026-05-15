import React from "react";

// Study OS design-system primitives — ported from the UI prototype
// (docs/reference/study-OS_UI_reference/primitives.jsx) into production
// React components so app screens share the prototype's visual language.
// Styling hooks (.eyebrow, .pill-*, .chip-*, .stamp-*, .sdot-*, .soft-card,
// .grain, .hairline, .rule, .bar) live in src/index.css.

export function Eyebrow({ children, dark = false, className = "" }) {
  return (
    <div className={`eyebrow ${dark ? "eyebrow-dark" : ""} ${className}`}>{children}</div>
  );
}

const PILL_TONE = {
  outline: "pill-outline",
  sage: "pill-sage",
  clay: "pill-clay",
  dusk: "pill-dusk",
  amber: "pill-amber",
  ink: "pill-ink",
  rose: "pill-rose",
};

export function Pill({ tone = "outline", children, className = "" }) {
  return <span className={`pill ${PILL_TONE[tone] || PILL_TONE.outline} ${className}`}>{children}</span>;
}

function layerGlyph(layer) {
  const map = { user: "u·", exam: "e·", update: "n·", engine: "⚙", plan: "p·" };
  return map[layer] ? <span style={{ fontWeight: 700, opacity: 0.7 }}>{map[layer]}</span> : null;
}

// `s` may be { layer, label } (prototype shape) or a plain string.
export function Chip({ s, layer, children }) {
  const lyr = layer || s?.layer || "engine";
  const label = children || s?.label || s;
  return (
    <span className={`chip chip-${lyr}`} title={`${lyr} intelligence`}>
      {layerGlyph(lyr)} {label}
    </span>
  );
}

export function ProvenanceChips({ sources }) {
  const list = Array.isArray(sources) ? sources : [];
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      <span className="eyebrow" style={{ fontSize: 9, letterSpacing: "0.18em", marginRight: 2 }}>
        Generated from
      </span>
      {list.map((s, i) => (
        <Chip key={i} s={s} />
      ))}
    </div>
  );
}

const STAMP_MAP = {
  official: { cls: "stamp-official", text: "Official" },
  aggregator: { cls: "stamp-aggregator", text: "Aggregator · needs verification" },
  research: { cls: "stamp-research", text: "Research · not official" },
  opportunity: { cls: "stamp-opportunity", text: "Opportunity · matched" },
  verified: { cls: "stamp-verified", text: "Verified" },
  needs: { cls: "stamp-needs", text: "Needs verification" },
  locked: { cls: "stamp-locked", text: "Locked" },
  preview: { cls: "stamp-preview", text: "Preview" },
  notcon: { cls: "stamp-notcon", text: "Not connected" },
  live: { cls: "stamp-live", text: "Live" },
};

export function TrustStamp({ kind, label }) {
  const m = STAMP_MAP[kind] || STAMP_MAP.preview;
  return <span className={`stamp ${m.cls}`}>{label || m.text}</span>;
}

export function VerifiedSeal({ size = 22 }) {
  return (
    <span
      aria-label="Officially verified"
      className="seal-verified inline-flex items-center justify-center rounded-full"
      style={{ width: size, height: size, flex: "0 0 auto" }}
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M3 8.4 6.4 11.5 13 4.6"
          stroke="#F0F5EF"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

const SDOT_STATE = {
  live: { dot: "sdot-live", text: "Live" },
  partial: { dot: "sdot-partial", text: "Partially connected" },
  preview: { dot: "sdot-preview", text: "Preview / static" },
  "not-connected": { dot: "sdot-not", text: "Not connected" },
};

export function StatusDot({ state = "preview", label }) {
  const s = SDOT_STATE[state] || SDOT_STATE.preview;
  const text = label === "" ? null : label || s.text;
  return (
    <span className="inline-flex items-center gap-2 text-[11px] text-clay-700">
      <span className={`sdot ${s.dot}`} aria-hidden="true" />
      {text}
    </span>
  );
}

// Soft prototype card. `padded` keeps the prototype's px-7 py-6 inner rhythm;
// pass padded={false} to control padding per-section.
export function StudyCard({ children, className = "", padded = true, ...rest }) {
  return (
    <section className={`soft-card grain relative overflow-hidden rounded-[18px] ${className}`} {...rest}>
      {padded ? <div className="px-7 py-6">{children}</div> : children}
    </section>
  );
}

export function SectionHeader({ eyebrow, title, sub, right, dark = false }) {
  return (
    <div className="flex items-end justify-between gap-6 mb-4">
      <div>
        {eyebrow ? <Eyebrow dark={dark}>{eyebrow}</Eyebrow> : null}
        {title ? (
          <h2
            className={`font-heading text-[22px] mt-1 leading-tight ${
              dark ? "text-[#F3EADB]" : "text-clay-900"
            }`}
          >
            {title}
          </h2>
        ) : null}
        {sub ? (
          <p className={`text-[12.5px] mt-1 max-w-[68ch] ${dark ? "text-[#D6BC93]" : "text-clay-700"}`}>
            {sub}
          </p>
        ) : null}
      </div>
      {right || null}
    </div>
  );
}

export function MiniBar({ pct = 0, color = "#54794E", height = 6, width = 120 }) {
  const clamped = Math.max(0, Math.min(1, Number(pct) || 0));
  return (
    <div className="bar" style={{ height, width }}>
      <i style={{ width: `${Math.round(clamped * 100)}%`, background: color }} />
    </div>
  );
}

// Prototype `Card` alias — same soft-card surface as StudyCard. A
// `data-screen-label` attribute may be passed through via rest props.
export const Card = StudyCard;

// Page-level header — ported from the prototype `PageHeader`.
export function PageHeader({ eyebrow, title, sub, right }) {
  return (
    <header className="flex items-end justify-between gap-6 flex-wrap mb-6">
      <div>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        {title ? (
          <h1 className="font-heading text-[36px] mt-2 leading-[1.05]">{title}</h1>
        ) : null}
        {sub ? <p className="text-[14px] text-clay-700 mt-2 max-w-[70ch]">{sub}</p> : null}
      </div>
      {right || null}
    </header>
  );
}

// Inline pill tab strip — ported from the prototype `Tabs`.
export function Tabs({ value, onChange, options = [] }) {
  return (
    <div className="flex flex-wrap gap-1 bg-[#F3EADB] p-1 rounded-full border border-[#E7DECB] w-fit">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange && onChange(o.value)}
          className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition ${
            value === o.value
              ? "bg-[#4E3A29] text-[#F3EADB]"
              : "text-clay-700 hover:bg-[#E7D6BA]"
          }`}
        >
          {o.label}
          {o.badge != null ? <span className="ml-1.5 num-mono opacity-70">{o.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

// Dashed empty-state panel — ported from the prototype `EmptyState`.
export function StudyEmptyState({ icon, title, body, cta }) {
  return (
    <div className="rounded-xl border border-dashed border-[#D6C9AC] bg-[#FBF8F2] p-8 text-center">
      <div className="text-[28px] mb-2">{icon || "·"}</div>
      {title ? <div className="font-heading text-[18px] text-clay-900">{title}</div> : null}
      {body ? (
        <div className="text-[12.5px] text-clay-700 mt-1.5 max-w-[40ch] mx-auto">{body}</div>
      ) : null}
      {cta ? <div className="mt-4">{cta}</div> : null}
    </div>
  );
}

const CONFIDENCE_TONE = (pct) => (pct >= 85 ? "sage" : pct >= 65 ? "amber" : "rose");

// Confidence pill with optional evidence count — ported from the prototype.
export function StudyConfidencePill({ value, evidence }) {
  const pct = Math.round((Number(value) || 0) * 100);
  return (
    <span className="inline-flex items-center gap-1.5">
      <Pill tone={CONFIDENCE_TONE(pct)}>Conf {pct}%</Pill>
      {evidence != null ? (
        <span className="num-mono text-[10.5px] text-clay-700">
          {typeof evidence === "number" ? `${evidence} evid.` : evidence}
        </span>
      ) : null}
    </span>
  );
}

// Right-anchored slide-over drawer — ported from the prototype `Drawer`.
export function Drawer({ open, onClose, title, children, width = 480 }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 drawer-bg" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : "Drawer"}
        className="absolute right-0 top-0 bottom-0 bg-[#FBF6EF] border-l border-[#E7DECB] shadow-2xl flex flex-col max-w-full"
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-[#E7DECB] flex items-center justify-between">
          <div className="font-heading text-[18px]">{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="text-clay-700 hover:text-clay-900"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
