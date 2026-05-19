import React from "react";
import { Timer, ClipboardCheck, CalendarCheck } from "lucide-react";

// Static homepage preview of the Study OS weekly loop: focus → mocks → review.
// Fixed sample data only — no API calls.
const STAGES = [
  {
    icon: Timer,
    label: "Focus",
    headline: "Deep-work blocks",
    body: "25 / 50 / 90-minute sessions with a short reflection that feeds your signals.",
    chip: "3 sessions logged",
  },
  {
    icon: ClipboardCheck,
    label: "Mocks",
    headline: "Honest mock curve",
    body: "Log every mock. Weak topics and error types surface as correction previews.",
    chip: "Trend +6%",
  },
  {
    icon: CalendarCheck,
    label: "Report Card",
    headline: "Close the loop",
    body: "Planned vs studied, what improved, what declined — and what Study OS changes next.",
    chip: "82% adherence",
  },
];

export default function LandingStudyFlowPreview() {
  return (
    <div
      className="grid sm:grid-cols-3 gap-3"
      data-testid="landing-study-flow-preview"
      aria-label="Sample Study OS weekly loop preview"
    >
      {STAGES.map((stage) => {
        const Icon = stage.icon;
        return (
          <div key={stage.label} className="soft-card rounded-2xl p-4 flex flex-col">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-clay-100 grid place-items-center text-clay-700">
                <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              </div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
                {stage.label}
              </div>
            </div>
            <div className="font-heading text-[15px] font-semibold mt-3">{stage.headline}</div>
            <p className="mt-1 text-[12px] text-foreground/70 leading-relaxed flex-1">
              {stage.body}
            </p>
            <span className="pill pill-sage text-[10px] mt-3 self-start">{stage.chip}</span>
          </div>
        );
      })}
    </div>
  );
}
