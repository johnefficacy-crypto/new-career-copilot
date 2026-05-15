import React from "react";
import { ShieldCheck, BookOpenCheck, LineChart, Users, ArrowRight } from "lucide-react";

// Static, non-authenticated "how it works" flow for the public homepage.
// Sample copy only — no API calls, no user data.
const STEPS = [
  {
    icon: ShieldCheck,
    label: "Official sources",
    body: "Recruitment boards watched. Nothing ships until it clears a review gate.",
  },
  {
    icon: BookOpenCheck,
    label: "Eligibility",
    body: "Rule-based age, qualification, category and domicile verdicts you can audit.",
  },
  {
    icon: LineChart,
    label: "Study OS",
    body: "Verified signals and your weekly progress become the next correct action.",
  },
  {
    icon: Users,
    label: "Community",
    body: "Moderated spaces and mentors who have actually cracked the exam.",
  },
];

export default function LandingHowItWorksFlow() {
  return (
    <div
      className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-7 lg:items-stretch"
      data-testid="landing-how-it-works-flow"
    >
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        return (
          <React.Fragment key={step.label}>
            <div className="soft-card rounded-3xl p-5 lg:col-span-1 lg:[grid-column:span_1] flex flex-col">
              <div className="h-10 w-10 rounded-full bg-clay-100 grid place-items-center text-clay-700 mb-4">
                <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
              </div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
                Step {i + 1}
              </div>
              <h3 className="font-heading text-lg font-semibold mt-1">{step.label}</h3>
              <p className="mt-1.5 text-[13px] text-foreground/70 leading-relaxed">
                {step.body}
              </p>
            </div>
            {i < STEPS.length - 1 ? (
              <div className="hidden lg:flex items-center justify-center" aria-hidden="true">
                <ArrowRight className="h-5 w-5 text-clay-400" />
              </div>
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );
}
