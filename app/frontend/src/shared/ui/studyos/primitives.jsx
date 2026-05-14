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
