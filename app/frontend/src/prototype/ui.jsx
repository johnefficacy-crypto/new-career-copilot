import React from "react";
import {
  Eyebrow as _Eyebrow,
  Pill,
  Chip,
  ProvenanceChips,
  TrustStamp,
  VerifiedSeal,
  StatusDot,
  Card,
  SectionHeader,
  MiniBar,
  PageHeader,
  Tabs,
  Drawer,
  StudyEmptyState,
  StudyConfidencePill,
  Avatar,
  VerifiedTopperBadge,
  VerifiedOfficerBadge,
  MentorBadge,
  AdminBadge,
  UserBadge,
  UserChip,
  VoteColumn,
  ChannelIcon,
  SpaceIcon,
  SourceTrustStamp,
  formatVotes,
} from "../shared/ui/studyos";
import { MARKET_CATEGORIES } from "./data/market";

// Eyebrow shim — the prototype screens pass `tone="dark"`; the shared
// primitive expects a `dark` boolean.
export function Eyebrow({ tone, dark, children, className }) {
  return (
    <_Eyebrow dark={dark || tone === "dark"} className={className}>
      {children}
    </_Eyebrow>
  );
}

// Prototype aliases for the shared primitives.
export const EmptyState = StudyEmptyState;
export const ConfidencePill = StudyConfidencePill;

export {
  Pill, Chip, ProvenanceChips, TrustStamp, VerifiedSeal, StatusDot, Card,
  SectionHeader, MiniBar, PageHeader, Tabs, Drawer, Avatar,
  VerifiedTopperBadge, VerifiedOfficerBadge, MentorBadge, AdminBadge,
  UserBadge, UserChip, VoteColumn, ChannelIcon, SpaceIcon, SourceTrustStamp,
  formatVotes,
};

// Shared footer strip used at the bottom of every prototype screen.
export function FooterStrip() {
  return (
    <footer className="px-10 pt-3 pb-10 flex items-center justify-between flex-wrap gap-3">
      <div className="num-mono text-[10.5px] text-clay-700">
        ccp · study-os prototype · docs/reference/UI_claude-code
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="num-mono text-[10.5px] text-clay-700">Trust policy:</span>
        <TrustStamp kind="official" label="Auto-apply after review" />
        <TrustStamp kind="aggregator" label="Discovery only" />
        <TrustStamp kind="research" label="Hint only" />
        <TrustStamp kind="opportunity" label="Adjacent" />
      </div>
    </footer>
  );
}

// KPI tile — used across the prototype library/seller/admin screens.
const KPI_TONES = { ink: "#2E2218", amber: "#6F5A22", sage: "#33482F", rose: "#7A3925" };
export function KPI({ k, v, tone, sub }) {
  return (
    <div className="soft-card grain relative px-4 py-3.5">
      <Eyebrow>{k}</Eyebrow>
      <div className="font-serif text-[26px] mt-1.5 leading-none" style={{ color: KPI_TONES[tone] || "#2E2218" }}>
        {v}
      </div>
      {sub ? <div className="text-[11px] text-clay-700 mt-2">{sub}</div> : null}
    </div>
  );
}

// Seller trust badge — ported from the prototype's screen-market.
const SELLER_TRUST = {
  "first-party": { tone: "ink", label: "Career Copilot · in-house" },
  "verified-topper": { tone: "sage", label: "Verified Topper" },
  "verified-officer": { tone: "dusk", label: "Verified Officer" },
  mentor: { tone: "clay", label: "Mentor" },
  institute: { tone: "amber", label: "Verified institute" },
  affiliate: { tone: "outline", label: "Affiliate partner" },
  community: { tone: "outline", label: "Community seller" },
};
export function SellerTrustBadge({ trust, className = "" }) {
  const m = SELLER_TRUST[trust] || SELLER_TRUST.community;
  return (
    <Pill tone={m.tone} className={`!text-[9.5px] ${className}`}>
      {m.label}
    </Pill>
  );
}

// Price block — ported from the prototype's screen-market.
export function PriceBlock({ p, large }) {
  const off =
    p.originalPrice && p.originalPrice > p.price
      ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100)
      : 0;
  return (
    <div className="flex items-baseline gap-2">
      <span className={`font-serif ${large ? "text-[28px]" : "text-[18px]"} text-clay-900`}>
        {p.currency}
        {p.price.toLocaleString()}
      </span>
      {off > 0 ? (
        <>
          <span className={`num-mono text-clay-500 line-through ${large ? "text-[14px]" : "text-[11.5px]"}`}>
            {p.currency}
            {p.originalPrice.toLocaleString()}
          </span>
          <Pill tone="sage" className={large ? "" : "!text-[9.5px]"}>
            {off}% off
          </Pill>
        </>
      ) : null}
    </div>
  );
}

// Product cover tile — ported from the prototype's screen-market.
export function ProductCover({ p, h = 96, small }) {
  const cat = MARKET_CATEGORIES.find((c) => c.id === p.type);
  return (
    <div
      className="rounded-lg overflow-hidden relative shrink-0"
      style={{ height: h, width: h, background: p.coverHue || cat?.color || "#A68057" }}
    >
      <div className="absolute inset-0 grain" />
      <span
        className="absolute top-1.5 left-1.5 num-mono text-[9px] tracking-[0.18em] uppercase"
        style={{ color: "rgba(243,234,219,0.85)" }}
      >
        {cat?.label || p.type}
      </span>
      <span className="absolute bottom-1.5 left-1.5 text-[#F3EADB]" style={{ fontSize: small ? 24 : 34, lineHeight: 1 }}>
        {cat?.icon || "·"}
      </span>
      {p.affiliate ? (
        <span className="absolute top-1.5 right-1.5 stamp" style={{ background: "#FBF6EF", color: "#6C5038", fontSize: 8.5 }}>
          AFF
        </span>
      ) : null}
    </div>
  );
}

// Page wrapper — gives every prototype screen the linen canvas + width cap.
export function PrototypePage({ children, label }) {
  return (
    <div className="linen-bg min-h-screen" data-screen-label={label}>
      <div className="max-w-[1280px] mx-auto">{children}</div>
    </div>
  );
}
