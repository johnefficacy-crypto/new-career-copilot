import React from "react";
import { User, BookOpen, Newspaper, Cpu } from "lucide-react";

// Preview-only descriptive layer panel. Real signal counts and items will arrive
// when backend exam-intelligence + update-intelligence endpoints land. Until then
// this panel shows the planning surface as documentation, never as live data.
const LAYERS = [
  {
    key: "user",
    title: "User intelligence",
    caption: "What we know about you",
    Icon: User,
    accent: "dusk",
    items: [
      { k: "Availability", v: "Hours you said you have" },
      { k: "Weak topics", v: "From mocks, drills, focus signals" },
      { k: "Study history", v: "Sessions, adherence, streaks" },
      { k: "Mock history", v: "Scores, trend, weak topics" },
      { k: "Focus consistency", v: "Last 7 / 30 day pattern" },
    ],
  },
  {
    key: "exam",
    title: "Exam intelligence",
    caption: "What the exam looks like",
    Icon: BookOpen,
    accent: "sage",
    items: [
      { k: "Family · exam · cycle", v: "Career Copilot exam catalog" },
      { k: "Phase", v: "Prelims / mains / interview" },
      { k: "Syllabus tree", v: "Subjects → topics → microtopics" },
      { k: "PYQ trend", v: "Topic-level weight from past years" },
      { k: "High-yield topics", v: "Where marks actually come from" },
    ],
  },
  {
    key: "update",
    title: "Update intelligence",
    caption: "What the world is saying",
    Icon: Newspaper,
    accent: "clay",
    items: [
      { k: "Official updates", v: "Notifications, dates, eligibility" },
      { k: "Deadline changes", v: "Calendar deltas applied to plan" },
      { k: "Pattern changes", v: "Syllabus, paper structure shifts" },
      { k: "Syllabus changes", v: "Addendums, new microtopics" },
      { k: "Current affairs", v: "Daily digest tied to weak topics" },
    ],
  },
  {
    key: "engine",
    title: "Study OS engine",
    caption: "How it composes the plan",
    Icon: Cpu,
    accent: "ink",
    items: [
      { k: "Prioritization", v: "Weak · prereq · cadence" },
      { k: "Spaced revision", v: "Interval scheduling per topic" },
      { k: "Weak-area drills", v: "Targeted practice loops" },
      { k: "Plan regeneration", v: "Daily compile + weekly correct" },
      { k: "Weekly correction", v: "Truth panel feeds next week" },
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
            Study OS converts user signals, exam intelligence, world updates and study
            history into the next best action. This panel is a preview — the metadata
            layer isn't fully wired to live backend endpoints yet.
          </p>
        </div>
        <span className="pill pill-amber" data-testid="layers-preview-tag">Preview</span>
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
