import React from "react";
import { Link } from "react-router-dom";
import { Card, Eyebrow, FooterStrip, PageHeader, Pill, PrototypePage } from "./ui";

const SCREENS = [
  { to: "/prototype/eligibility", title: "Eligibility · live matches", tag: "Aspirant", glyph: "⌖", sub: "Recruitments matched to your profile, continuously." },
  { to: "/prototype/groups", title: "Study Groups", tag: "Aspirant", glyph: "◇", sub: "Group dashboard with sessions, check-ins, members." },
  { to: "/prototype/resources", title: "Resource library", tag: "Aspirant", glyph: "≣", sub: "Source-tagged free resources, never silently 'recommended'." },
  { to: "/prototype/library", title: "My library", tag: "Aspirant", glyph: "❒", sub: "Purchases · cart · order history · saved-for-later." },
  { to: "/prototype/seller", title: "Sell on CCP", tag: "Aspirant", glyph: "₹", sub: "Seller dashboard: listings, payouts, reviews." },
  { to: "/prototype/onboarding", title: "Onboarding · chat funnel", tag: "Entry", glyph: "➤", sub: "Anonymous-first 5–7 question conversation + earned login." },
  { to: "/prototype/admin-eligibility", title: "Admin · Eligibility", tag: "Admin", glyph: "⌗", sub: "Criteria verification queue · sources · match impact." },
  { to: "/prototype/admin-community", title: "Admin · Community", tag: "Admin", glyph: "✦", sub: "Reports, mentor approvals, badge management." },
  { to: "/prototype/admin-marketplace", title: "Admin · Marketplace", tag: "Admin", glyph: "⊕", sub: "Approvals · refunds · payouts · flagged listings." },
  { to: "/prototype/admin-funnel", title: "Admin · Funnel analytics", tag: "Admin", glyph: "↗", sub: "Anon → S7 funnel · drop-off per question · stitch audit." },
  { to: "/prototype/handoff", title: "Handoff & gaps", tag: "Meta", glyph: "✎", sub: "Component inventory · design tokens · surface matrix · backend gaps." },
];

function ScreenLink({ s }) {
  return (
    <Link
      to={s.to}
      className="group rounded-2xl border border-[#E7DECB] bg-white/70 hover:bg-white hover:border-[#A68057] p-5 transition block"
    >
      <div className="flex items-center justify-between">
        <Pill tone="outline">{s.tag}</Pill>
        <span className="text-[20px] text-[#A68057]">{s.glyph}</span>
      </div>
      <div className="font-serif text-[18px] mt-3 leading-tight">{s.title}</div>
      <div className="text-[12.5px] text-clay-700 mt-1.5">{s.sub}</div>
      <div className="mt-4 text-[12px] font-semibold flex items-center gap-1.5 text-clay-900">
        <span>Open</span>
        <span className="transition-transform group-hover:translate-x-1">→</span>
      </div>
    </Link>
  );
}

export default function PrototypeIndex() {
  return (
    <PrototypePage label="Prototype index">
      <div className="px-10 pt-9">
        <PageHeader
          eyebrow="Prototype · gallery"
          title="Every prototype screen, mounted as a reachable React component."
          sub="These mirror docs/reference/UI_claude-code/screen-*.jsx as faithfully as the production primitives allow. Mock data only — no backend calls, no routes to break."
          right={
            <Link to="/" className="text-[12px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-clay-700 font-semibold">
              ← Back to home
            </Link>
          }
        />
      </div>
      <div className="px-10">
        <Card className="!bg-[#F0F5EF] !border-[#B9CFAF]">
          <Eyebrow>About this gallery</Eyebrow>
          <p className="text-[13px] text-[#33482F] mt-1.5 max-w-[72ch]">
            The screens listed below are <strong>not wired to live data</strong>. They are visual ports of the prototype, useful for design review, QA against the prototype, and pulling components into production screens. For functional production screens with real data, see the routes under <span className="num-mono">/app</span> and <span className="num-mono">/admin</span>.
          </p>
        </Card>
        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {SCREENS.map((s) => (
            <ScreenLink key={s.to} s={s} />
          ))}
        </div>
      </div>
      <FooterStrip />
    </PrototypePage>
  );
}
