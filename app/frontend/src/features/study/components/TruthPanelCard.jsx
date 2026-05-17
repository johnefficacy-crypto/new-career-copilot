import React from "react";
import { SectionHeader, StatusDot, StudyCard } from "../../../shared/ui/studyos";

const TONES = {
  sage: { bg: "#F0F5EF", fg: "#33482F" },
  rose: { bg: "#F2DDD6", fg: "#7A3925" },
  amber: { bg: "#F3E9CF", fg: "#6F5A22" },
};

// Truth panel styled after the prototype: an honest read split into calm
// columns. Backend `truth_panel` provides { summary, warnings, corrections }.
function TruthCol({ title, tone, items, emptyText }) {
  const palette = TONES[tone] || TONES.amber;
  const list = Array.isArray(items) ? items : [];
  return (
    <div
      className="rounded-xl border border-[#E7DECB] p-4"
      style={{ background: palette.bg }}
    >
      <div className="eyebrow" style={{ color: palette.fg, fontSize: 10 }}>
        {title}
      </div>
      {list.length ? (
        <ul className="mt-2 space-y-1.5 text-[12.5px]" style={{ color: palette.fg }}>
          {list.map((it, i) => (
            <li key={i} className="flex gap-2 items-start">
              <span className="opacity-60" aria-hidden="true">·</span>
              <span>{typeof it === "string" ? it : it?.message || ""}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[12px]" style={{ color: palette.fg, opacity: 0.8 }}>
          {emptyText}
        </p>
      )}
    </div>
  );
}

export default function TruthPanelCard({ panel }) {
  const summary = panel?.summary || "Not enough data yet to summarise your week.";
  const warnings = Array.isArray(panel?.warnings) ? panel.warnings : [];
  const corrections = Array.isArray(panel?.corrections) ? panel.corrections : [];

  return (
    <StudyCard data-testid="truth-panel">
      <SectionHeader
        eyebrow="Truth panel · weekly"
        title="Honest read. No motivational fluff."
        sub={summary}
        right={<StatusDot state="live" label="" />}
      />
      <div className="grid md:grid-cols-2 gap-5">
        <TruthCol
          title="Watch"
          tone="amber"
          items={warnings}
          emptyText="Nothing flagged to watch this week."
        />
        <TruthCol
          title="Needs correction"
          tone="rose"
          items={corrections}
          emptyText="No corrections needed — a good week."
        />
      </div>
    </StudyCard>
  );
}
