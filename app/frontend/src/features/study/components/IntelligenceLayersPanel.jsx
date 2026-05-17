import React from "react";
import { User, BookOpen, Newspaper, Cpu } from "lucide-react";

// Preview-only descriptive layer panel. Real signal counts and items will
// arrive when backend exam-intelligence + update-intelligence endpoints
// land. The captions and item values are deliberately phrased in
// future tense so aspirants do NOT read this panel as live state.
const LAYERS = [
  {
    key: "user",
    title: "User intelligence",
    caption: "What we’ll know about you",
    Icon: User,
    accent: "dusk",
    items: [
      { k: "Availability", v: "Will show hours you can study" },
      { k: "Weak topics", v: "Will surface from mocks, drills, focus signals" },
      { k: "Study history", v: "Will track sessions and adherence" },
      { k: "Mock history", v: "Will plot scores, trend and weak topics" },
      { k: "Focus consistency", v: "Will summarise your 7 / 30 day pattern" },
    ],
  },
  {
    key: "exam",
    title: "Exam intelligence",
    caption: "What the exam looks like (once connected)",
    Icon: BookOpen,
    accent: "sage",
    items: [
      { k: "Family · exam · cycle", v: "Will pull from the exam catalog" },
      { k: "Phase", v: "Will show your current Prelims / Mains / Interview phase" },
      { k: "Syllabus tree", v: "Will display Subjects → topics → microtopics" },
      { k: "PYQ trend", v: "Will weight topics by past-year frequency" },
      { k: "High-yield topics", v: "Will rank topics by realised marks" },
    ],
  },
  {
    key: "update",
    title: "Update intelligence",
    caption: "What the world is saying (once connected)",
    Icon: Newspaper,
    accent: "clay",
    items: [
      { k: "Official updates", v: "Will flow in from notifications, dates, eligibility" },
      { k: "Deadline changes", v: "Will apply calendar deltas to your plan" },
      { k: "Pattern changes", v: "Will surface syllabus and paper-structure shifts" },
      { k: "Syllabus changes", v: "Will list addendums and new microtopics" },
      { k: "Current affairs", v: "Will tie a daily digest to your weak topics" },
    ],
  },
  {
    key: "engine",
    title: "Study OS engine",
    caption: "How it will compose the plan",
    Icon: Cpu,
    accent: "ink",
    items: [
      { k: "Prioritization", v: "Will weight by Weak · prereq · cadence" },
      { k: "Spaced revision", v: "Will schedule intervals per topic" },
      { k: "Weak-area drills", v: "Will queue targeted practice loops" },
      { k: "Plan regeneration", v: "Will compile daily, correct weekly" },
      { k: "Weekly correction", v: "Will feed the Truth panel into next week" },
    ],
  },
];

function layerCardClasses(accent) {
  if (accent === "ink") {
    return "rounded-xl border border-clay-900 bg-dusk-900 text-dusk-50 p-4";
  }
  if (accent === "sage") {
    return "rounded-xl border border-sage-200 bg-sage-50/50 p-4";
  }
  if (accent === "dusk") {
    return "rounded-xl border border-dusk-200 bg-dusk-50/50 p-4";
  }
  return "rounded-xl border border-clay-200 bg-clay-50/40 p-4";
}

function eyebrowClass(accent) {
  return accent === "ink"
    ? "text-[10px] uppercase tracking-[0.22em] font-semibold text-dusk-200"
    : "text-[10px] uppercase tracking-[0.22em] font-semibold text-muted-foreground";
}

function captionClass(accent) {
  return accent === "ink"
    ? "font-heading text-base mt-1 text-dusk-50"
    : "font-heading text-base mt-1 text-clay-800";
}

function keyClass(accent) {
  return accent === "ink"
    ? "text-[10px] uppercase tracking-wider font-mono text-clay-200"
    : "text-[10px] uppercase tracking-wider font-mono text-muted-foreground";
}

function valueClass(accent) {
  return accent === "ink" ? "text-xs text-dusk-50 text-right" : "text-xs text-clay-800 text-right";
}

export default function IntelligenceLayersPanel({ title = "Planning Intelligence Preview" }) {
  return (
    <section
      className="soft-card rounded-2xl p-5"
      aria-labelledby="intelligence-layers-heading"
      data-testid="intelligence-layers-panel"
    >
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
            The four layers
          </div>
          <h2
            id="intelligence-layers-heading"
            className="font-heading text-xl font-semibold mt-1"
          >
            {title}
          </h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-prose">
            <strong>Reference card, not live data.</strong> Study OS will convert
            user signals, exam intelligence, world updates and study history into
            the next best action. The metadata layer isn’t wired to live backend
            endpoints yet — every row below describes a future capability.
          </p>
        </div>
        <span className="pill pill-amber" data-testid="layers-preview-tag">
          Preview · not live
        </span>
      </div>

      <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {LAYERS.map((L) => {
          const { Icon } = L;
          return (
            <div
              key={L.key}
              className={layerCardClasses(L.accent)}
              data-testid={`layer-${L.key}`}
            >
              <div className="flex items-center justify-between">
                <div className={eyebrowClass(L.accent)}>{L.title}</div>
                <Icon
                  className={L.accent === "ink" ? "h-4 w-4 text-clay-200" : "h-4 w-4 text-muted-foreground"}
                  aria-hidden="true"
                />
              </div>
              <div className={captionClass(L.accent)}>{L.caption}</div>
              <ul className="mt-3 space-y-1.5">
                {L.items.map((it) => (
                  <li
                    key={it.k}
                    className="text-[12px] leading-snug flex justify-between gap-3"
                  >
                    <span
                      className={keyClass(L.accent)}
                      style={{ flex: "0 0 auto", width: 96 }}
                    >
                      {it.k}
                    </span>
                    <span className={valueClass(L.accent)}>{it.v}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="mt-3 text-[11px] text-muted-foreground italic">
        Metadata layer not connected yet — counts and signal values shown here are
        descriptive, not live.
      </div>
    </section>
  );
}
