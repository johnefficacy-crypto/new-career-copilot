// Field — design system for the community layer.
//
// Principles:
//   - One accent (deep moss green). No rainbow pills.
//   - Hairline borders, generous whitespace, no card chrome heroics.
//   - Sans display (Inter), mono for numerals and small-caps labels.
//   - Status communicated through text + a thin marker, not heavy colour blocks.
//   - Tables prefer row dividers to alternating fills.
//
// These primitives are scoped to features/community/. The rest of the app still
// uses shared/ui/studyos.

import React from "react";

/* ─── Page scaffolding ─────────────────────────────────────────────────── */

// DashShell already adds `p-5 lg:p-8 max-w-7xl mx-auto` around the route's
// Outlet for non-immersive pages, so FieldPage is just a Field-themed root —
// it forces the Field text/bg tokens on its subtree without re-padding.
export function FieldPage({ children, className = "", testId }) {
  return (
    <div
      data-testid={testId}
      className={`text-field-ink antialiased ${className}`}
    >
      {children}
    </div>
  );
}

export function FieldHeader({ eyebrow, title, sub, right }) {
  return (
    <header className="mb-8">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0 flex-1">
          {eyebrow ? <FieldLabel>{eyebrow}</FieldLabel> : null}
          <h1 className="font-sans text-[28px] lg:text-[32px] leading-tight tracking-tight mt-1.5 font-semibold text-field-ink">
            {title}
          </h1>
          {sub ? (
            <p className="text-[14px] text-field-ink-muted mt-2 max-w-[640px] leading-relaxed">{sub}</p>
          ) : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
    </header>
  );
}

export function FieldSection({ label, title, sub, right, children, className = "" }) {
  return (
    <section className={`mb-8 ${className}`}>
      {(label || title || right) && (
        <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
          <div className="min-w-0 flex-1">
            {label ? <FieldLabel>{label}</FieldLabel> : null}
            {title ? (
              <h2 className="font-sans text-[19px] leading-tight tracking-tight mt-1 font-semibold text-field-ink">
                {title}
              </h2>
            ) : null}
            {sub ? <p className="text-[13px] text-field-ink-muted mt-1">{sub}</p> : null}
          </div>
          {right ? <div className="shrink-0">{right}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}

/* ─── Labels & text ────────────────────────────────────────────────────── */

export function FieldLabel({ children, className = "", as: As = "span" }) {
  return (
    <As className={`font-mono text-[10px] uppercase tracking-[0.18em] text-field-ink-quiet ${className}`}>
      {children}
    </As>
  );
}

export function FieldMono({ children, className = "" }) {
  return <span className={`font-mono ${className}`}>{children}</span>;
}

export function FieldDivider({ className = "" }) {
  return <div className={`h-px bg-field-line ${className}`} role="separator" />;
}

/* ─── Surfaces ─────────────────────────────────────────────────────────── */

export function FieldCard({ children, className = "", padded = true, tone = "canvas", ...rest }) {
  const toneClass =
    tone === "accent"
      ? "bg-field-accent-soft border-field-accent/30"
      : tone === "ink"
        ? "bg-field-ink text-white border-field-ink"
        : "bg-field-canvas border-field-line";
  return (
    <div
      className={`rounded-md border ${toneClass} ${padded ? "p-6" : ""} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ─── Buttons ──────────────────────────────────────────────────────────── */

const BTN_BASE =
  "inline-flex items-center justify-center gap-1.5 font-medium rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-field-accent focus-visible:ring-offset-2 focus-visible:ring-offset-field-paper disabled:opacity-50 disabled:pointer-events-none";

const BTN_SIZE = {
  xs: "text-[11px] px-2.5 py-1 h-7",
  sm: "text-[12px] px-3 py-1.5 h-8",
  md: "text-[13px] px-4 py-2 h-9",
};

const BTN_VARIANT = {
  primary: "bg-field-accent text-white hover:bg-field-accent-ink",
  secondary: "bg-field-canvas text-field-ink border border-field-line hover:bg-field-line-soft",
  ghost: "text-field-ink-muted hover:text-field-ink hover:bg-field-line-soft",
  danger: "bg-field-canvas text-field-danger border border-field-danger/30 hover:bg-field-danger-soft",
  accentSoft: "bg-field-accent-soft text-field-accent-ink hover:bg-field-accent-soft/70",
};

export function FieldButton({
  children,
  variant = "secondary",
  size = "sm",
  as: As = "button",
  className = "",
  ...rest
}) {
  if (As === "button" && !rest.type) rest.type = "button";
  return (
    <As className={`${BTN_BASE} ${BTN_SIZE[size]} ${BTN_VARIANT[variant]} ${className}`} {...rest}>
      {children}
    </As>
  );
}

/* ─── Pills / status ───────────────────────────────────────────────────── */

const PILL_TONE = {
  neutral: "bg-field-line-soft text-field-ink-muted",
  outline: "border border-field-line text-field-ink-muted",
  accent: "bg-field-accent-soft text-field-accent-ink",
  warn: "bg-field-warn-soft text-field-warn",
  danger: "bg-field-danger-soft text-field-danger",
  info: "bg-field-info-soft text-field-info",
  ink: "bg-field-ink text-white",
};

export function FieldPill({ children, tone = "outline", className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] font-mono text-[10.5px] tracking-[0.04em] uppercase ${PILL_TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function FieldStatusDot({ state = "live", label }) {
  const map = {
    live: { dot: "bg-field-accent", text: "live" },
    paused: { dot: "bg-field-warn", text: "paused" },
    empty: { dot: "bg-field-ink-quiet", text: "empty" },
    error: { dot: "bg-field-danger", text: "error" },
    stale: { dot: "bg-field-line", text: "stale" },
  };
  const c = map[state] || map.live;
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-field-ink-quiet">
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {label != null ? label : c.text}
    </span>
  );
}

/* ─── Avatars ──────────────────────────────────────────────────────────── */

const AVATAR_PALETTE = [
  ["#E4EFE7", "#1E4730"],
  ["#F4EAD3", "#7B520C"],
  ["#E1E5EE", "#2C3D69"],
  ["#F2DDD7", "#6B2113"],
  ["#EEE6F2", "#4A2F66"],
  ["#E2EAE4", "#2F5036"],
];

function hashIdx(seed, mod) {
  if (!seed) return 0;
  let h = 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % mod;
}

function initials(name) {
  if (!name) return "·";
  const parts = String(name).trim().split(/\s+/);
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last || first).toUpperCase().slice(0, 2);
}

export function FieldAvatar({ user, size = 32, className = "" }) {
  if (!user) {
    return (
      <span
        aria-hidden="true"
        className={`inline-block rounded-full bg-field-line-soft ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  const seed = user.id || user.name || "";
  const [bg, fg] = AVATAR_PALETTE[hashIdx(seed, AVATAR_PALETTE.length)];
  const styleBg = user.avatarColor || bg;
  const styleFg = user.avatarColor ? "#FFFFFF" : fg;
  return (
    <span
      aria-label={user.name ? `${user.name} avatar` : "User avatar"}
      role="img"
      className={`inline-flex items-center justify-center rounded-full font-medium ${className}`}
      style={{ width: size, height: size, background: styleBg, color: styleFg, fontSize: Math.max(11, Math.round(size * 0.36)) }}
    >
      {initials(user.name || user.handle || user.id)}
    </span>
  );
}

/* ─── KPI / progress ───────────────────────────────────────────────────── */

export function FieldKpi({ label, value, sub, tone, className = "" }) {
  const toneClass =
    tone === "warn"
      ? "text-field-warn"
      : tone === "danger"
        ? "text-field-danger"
        : tone === "accent"
          ? "text-field-accent-ink"
          : "text-field-ink";
  return (
    <div className={`p-4 rounded-md bg-field-canvas border border-field-line ${className}`}>
      <FieldLabel>{label}</FieldLabel>
      <div className={`font-sans text-[24px] font-semibold leading-none mt-2 ${toneClass}`}>{value}</div>
      {sub ? <div className="text-[11.5px] text-field-ink-muted mt-1.5">{sub}</div> : null}
    </div>
  );
}

export function FieldProgress({ value = 0, max = 1, tone = "accent", height = 4, className = "", label }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const fill = tone === "warn" ? "bg-field-warn" : tone === "danger" ? "bg-field-danger" : "bg-field-accent";
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label || undefined}
      className={`w-full bg-field-line-soft rounded-full overflow-hidden ${className}`}
      style={{ height }}
    >
      <div className={`h-full ${fill} transition-[width] duration-300`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ─── Tabs / segmented controls ────────────────────────────────────────── */

export function FieldTabs({ value, onChange, options = [], className = "" }) {
  return (
    <div role="tablist" className={`inline-flex items-center gap-1 border-b border-field-line ${className}`}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`relative px-3 py-2 text-[13px] font-medium transition-colors ${
              active ? "text-field-ink" : "text-field-ink-quiet hover:text-field-ink-muted"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              {opt.label}
              {opt.badge != null && opt.badge !== 0 ? (
                <span className="font-mono text-[10px] text-field-ink-quiet">{opt.badge}</span>
              ) : null}
            </span>
            {active ? (
              <span aria-hidden="true" className="absolute left-1 right-1 -bottom-px h-[2px] bg-field-accent rounded-t" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function FieldSegmented({ value, onChange, options = [], className = "" }) {
  return (
    <div
      role="radiogroup"
      className={`inline-flex items-center p-0.5 bg-field-line-soft rounded-md border border-field-line ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`px-3 h-7 text-[12px] font-medium rounded-[5px] transition-colors ${
              active ? "bg-field-canvas text-field-ink shadow-[0_1px_2px_rgba(0,0,0,0.04)]" : "text-field-ink-quiet hover:text-field-ink-muted"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Forms ────────────────────────────────────────────────────────────── */

export function FieldInput({ className = "", ...rest }) {
  return (
    <input
      className={`w-full h-9 px-3 rounded-md border border-field-line bg-field-canvas text-[13px] text-field-ink placeholder:text-field-ink-quiet focus:outline-none focus:border-field-accent focus:ring-1 focus:ring-field-accent/40 transition ${className}`}
      {...rest}
    />
  );
}

export function FieldTextarea({ className = "", rows = 3, ...rest }) {
  return (
    <textarea
      rows={rows}
      className={`w-full px-3 py-2 rounded-md border border-field-line bg-field-canvas text-[13px] text-field-ink placeholder:text-field-ink-quiet focus:outline-none focus:border-field-accent focus:ring-1 focus:ring-field-accent/40 transition resize-y ${className}`}
      {...rest}
    />
  );
}

export function FieldFieldGroup({ label, hint, children, className = "" }) {
  return (
    <div className={className}>
      {label ? <FieldLabel className="block mb-1.5">{label}</FieldLabel> : null}
      {children}
      {hint ? <div className="text-[11px] text-field-ink-quiet mt-1.5">{hint}</div> : null}
    </div>
  );
}

/* ─── Empty / loading ──────────────────────────────────────────────────── */

export function FieldEmpty({ title, body, icon, cta, className = "" }) {
  return (
    <div
      className={`rounded-md border border-dashed border-field-line bg-field-canvas px-6 py-10 text-center ${className}`}
    >
      {icon ? <div className="text-field-ink-quiet text-[22px] mb-2" aria-hidden="true">{icon}</div> : null}
      <div className="font-sans text-[15px] font-medium text-field-ink">{title}</div>
      {body ? <div className="text-[12.5px] text-field-ink-muted mt-1.5 max-w-[420px] mx-auto">{body}</div> : null}
      {cta ? <div className="mt-4">{cta}</div> : null}
    </div>
  );
}

/* ─── Drawer ───────────────────────────────────────────────────────────── */

export function FieldDrawer({ open, onClose, title, children, width = 480, footer }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-field-ink/30 animate-[fadeIn_120ms_ease-out]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : "Drawer"}
        className="absolute right-0 top-0 bottom-0 bg-field-canvas border-l border-field-line shadow-xl flex flex-col max-w-full"
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 h-14 border-b border-field-line flex items-center justify-between shrink-0">
          <div className="font-sans text-[15px] font-semibold text-field-ink">{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="grid h-8 w-8 place-items-center rounded-md text-field-ink-muted hover:bg-field-line-soft hover:text-field-ink"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-auto px-5 py-5">{children}</div>
        {footer ? <div className="px-5 py-3 border-t border-field-line bg-field-line-soft/50">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ─── Vote column ──────────────────────────────────────────────────────── */

export function FieldVoteColumn({ value = 0, vote = 0, onVote, disabled, className = "" }) {
  const formatted = value > 999 ? `${(value / 1000).toFixed(1)}k` : value;
  return (
    <div className={`flex flex-col items-center gap-0.5 ${className}`} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label="Upvote"
        aria-pressed={vote === 1}
        disabled={disabled}
        onClick={() => onVote && onVote(1)}
        className={`grid place-items-center h-6 w-6 rounded-[5px] transition-colors ${
          vote === 1
            ? "text-field-accent bg-field-accent-soft"
            : "text-field-ink-quiet hover:text-field-ink hover:bg-field-line-soft"
        } disabled:opacity-40 disabled:pointer-events-none`}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M6 2L2 7h2.5v3h3V7H10L6 2z" fill="currentColor" />
        </svg>
      </button>
      <span className="font-mono text-[11.5px] text-field-ink tabular-nums">{formatted}</span>
      <button
        type="button"
        aria-label="Downvote"
        aria-pressed={vote === -1}
        disabled={disabled}
        onClick={() => onVote && onVote(-1)}
        className={`grid place-items-center h-6 w-6 rounded-[5px] transition-colors ${
          vote === -1
            ? "text-field-danger bg-field-danger-soft"
            : "text-field-ink-quiet hover:text-field-ink hover:bg-field-line-soft"
        } disabled:opacity-40 disabled:pointer-events-none`}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M6 10L2 5h2.5V2h3v3H10L6 10z" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
}

/* ─── Table ────────────────────────────────────────────────────────────── */

export function FieldTable({ headers, children, className = "", testId }) {
  return (
    <div className={`overflow-x-auto -mx-2 ${className}`} data-testid={testId}>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left">
            {headers.map((h, i) => (
              <th
                key={i}
                className="font-mono text-[10px] uppercase tracking-[0.16em] text-field-ink-quiet font-normal px-3 py-2 border-b border-field-line"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_tr]:border-b [&_tr]:border-field-line-soft last:[&_tr]:border-b-0">
          {children}
        </tbody>
      </table>
    </div>
  );
}

export function FieldTd({ children, className = "", mono = false, ...rest }) {
  return (
    <td className={`px-3 py-3 align-top text-field-ink ${mono ? "font-mono" : ""} ${className}`} {...rest}>
      {children}
    </td>
  );
}

/* ─── Source trust stamp ───────────────────────────────────────────────── */

export function FieldSourceTrust({ trust }) {
  const map = {
    official: { tone: "accent", label: "Official" },
    coaching: { tone: "info", label: "Coaching" },
    community: { tone: "neutral", label: "Community" },
    aspirant: { tone: "neutral", label: "Aspirant" },
  };
  const v = map[trust] || map.community;
  return <FieldPill tone={v.tone}>{v.label}</FieldPill>;
}

/* ─── Confidence pill ──────────────────────────────────────────────────── */

export function FieldConfidence({ value, max = 1 }) {
  const pct = Math.round(((Number(value) || 0) / max) * 100);
  const tone = pct >= 80 ? "accent" : pct >= 50 ? "info" : "warn";
  return <FieldPill tone={tone}>{pct}% match</FieldPill>;
}

/* ─── Animations ───────────────────────────────────────────────────────── */

// Small keyframe registered via inline style elsewhere; Tailwind doesn't pick up
// inline animation names so we define `fadeIn` in src/index.css already. The
// drawer above uses `animate-[fadeIn_120ms_ease-out]` which requires no JIT
// definition — Tailwind passes it through verbatim.
