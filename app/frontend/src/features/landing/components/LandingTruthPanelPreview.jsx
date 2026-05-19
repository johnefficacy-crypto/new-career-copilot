import React from "react";
import { TrendingUp, TrendingDown, Wrench } from "lucide-react";

// Static homepage preview of the weekly "truth panel" — the calm, honest
// summary Study OS writes for each aspirant. Fixed sample copy only.
const COLUMNS = [
  {
    icon: TrendingUp,
    tone: "sage",
    label: "What improved",
    items: ["Morning consistency +12%", "Polity mastery +8pp"],
  },
  {
    icon: TrendingDown,
    tone: "clay",
    label: "What declined",
    items: ["Mains answer practice", "Mock review latency"],
  },
  {
    icon: Wrench,
    tone: "dusk",
    label: "What Study OS changes next",
    items: ["Add GS-2 drill Wed + Sat", "Review Mock 13 before Mock 14"],
  },
];

const TONE_TEXT = {
  sage: "text-sage-700",
  clay: "text-clay-700",
  dusk: "text-dusk-700",
};

export default function LandingTruthPanelPreview() {
  return (
    <div
      className="soft-card rounded-3xl p-6 space-y-4"
      data-testid="landing-truth-panel-preview"
      aria-label="Sample weekly Progress vs Plan preview"
    >
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
          Report Card · the honest panel
        </div>
        <span className="pill pill-dusk text-[10px]">Sample preview</span>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        {COLUMNS.map((col) => {
          const Icon = col.icon;
          return (
            <div
              key={col.label}
              className="rounded-2xl bg-clay-50 border border-clay-100 p-3"
            >
              <div
                className={`flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] font-semibold ${TONE_TEXT[col.tone]}`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {col.label}
              </div>
              <ul className="mt-2 space-y-1 text-[12px] text-foreground/75">
                {col.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="text-[12px] text-muted-foreground">
        Calm, direct, never shaming — built from your logged progress, not guesses.
      </p>
    </div>
  );
}
