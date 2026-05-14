import React from "react";
import { Wand2 } from "lucide-react";

// Correction-task categories Study OS would generate from a reviewed mock.
// Generation is intentionally NOT wired here — there is no planner endpoint
// that accepts mock-derived correction tasks yet, so this stays a preview.
const CATEGORIES = [
  { key: "concept_gap", label: "Concept gap", hint: "Topic not understood — needs a fresh learn block." },
  { key: "memory_gap", label: "Memory gap", hint: "Known once, forgotten — schedule spaced revision." },
  { key: "careless", label: "Careless", hint: "Knew it, slipped — add a focused accuracy drill." },
  { key: "speed_issue", label: "Speed issue", hint: "Correct but slow — add timed practice." },
  { key: "option_trap", label: "Option trap", hint: "Misled by a distractor — review elimination technique." },
];

export default function MockCorrectionPreview({ weakTopics }) {
  const topics = Array.isArray(weakTopics) ? weakTopics.filter(Boolean) : [];
  return (
    <section
      className="rounded-2xl border border-dashed border-clay-200 bg-clay-50/60 p-4"
      data-testid="mock-correction-preview"
      aria-labelledby="mock-correction-heading"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-clay-600" aria-hidden="true" />
          <h3
            id="mock-correction-heading"
            className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-semibold"
          >
            Correction tasks
          </h3>
        </div>
        <span className="pill pill-dusk text-[10px]">Preview</span>
      </div>
      <ul className="mt-3 space-y-2">
        {CATEGORIES.map((c) => (
          <li key={c.key} className="flex items-start gap-2 text-xs">
            <span className="pill pill-clay text-[10px] shrink-0">{c.label}</span>
            <span className="text-muted-foreground">{c.hint}</span>
          </li>
        ))}
      </ul>
      {topics.length ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Likely drawn from your weak topics: {topics.join(", ")}.
        </p>
      ) : null}
      <p className="mt-3 text-[11px] text-clay-700">
        Correction-task creation requires a planner endpoint — this is a preview of
        what Study OS would schedule.
      </p>
    </section>
  );
}
