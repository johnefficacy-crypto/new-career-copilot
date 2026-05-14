import React from "react";
import { BadgeCheck, ShieldQuestion, FlaskConical } from "lucide-react";

// Static homepage preview of how Study OS tiers exam-intelligence sources.
// Communicates the official-first, review-gated trust model with sample rows.
const TIERS = [
  {
    icon: BadgeCheck,
    tone: "pill-sage",
    label: "Official",
    note: "Can affect plans, deadlines and eligibility once reviewed.",
    sample: "SSC CGL 2026 notification",
  },
  {
    icon: ShieldQuestion,
    tone: "pill-amber",
    label: "Aggregator",
    note: "Discovery only — never shown as truth until an official source confirms it.",
    sample: "Coaching-site exam date rumour",
  },
  {
    icon: FlaskConical,
    tone: "pill-dusk",
    label: "Research",
    note: "Strategy signal — informs study emphasis, not official truth.",
    sample: "PYQ weightage analysis",
  },
];

export default function LandingExamTrustPreview() {
  return (
    <div
      className="soft-card rounded-3xl p-6 space-y-4"
      data-testid="landing-exam-trust-preview"
      aria-label="Sample exam intelligence trust model preview"
    >
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
          Exam intelligence · official-first
        </div>
        <span className="pill pill-dusk text-[10px]">Sample preview</span>
      </div>
      <p className="text-[13px] text-foreground/70">
        Every signal carries a source tier. Only reviewed official sources can change
        your plan — aggregator content stays clearly labelled as unverified.
      </p>
      <ul className="space-y-2.5">
        {TIERS.map((tier) => {
          const Icon = tier.icon;
          return (
            <li
              key={tier.label}
              className="rounded-2xl bg-clay-50 border border-clay-100 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <span className={`pill ${tier.tone} text-[11px]`}>
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {tier.label}
                </span>
                <span className="text-[11px] text-muted-foreground truncate">
                  {tier.sample}
                </span>
              </div>
              <p className="mt-1.5 text-[12px] text-foreground/70">{tier.note}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
