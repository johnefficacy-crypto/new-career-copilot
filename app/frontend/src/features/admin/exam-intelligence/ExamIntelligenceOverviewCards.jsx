import React from "react";
import { Eyebrow, StatusDot } from "../../../shared/ui/studyos";

// Prototype-style KPI card — grained 14-px soft-card, eyebrow label,
// serif value, small delta hint, optional status dot top-right.
const TONE_TEXT = {
  sage: "text-sage-700",
  clay: "text-clay-700",
  dusk: "text-dusk-700",
  ink: "text-clay-900",
};

function KpiCard({ label, value, hint, tone = "ink", state, testId }) {
  const display = value === null || value === undefined ? "—" : value;
  return (
    <div
      className="soft-card grain relative overflow-hidden rounded-[14px] px-4 py-3.5"
      data-testid={testId || `exam-intel-card-${label}`}
    >
      <Eyebrow>{label}</Eyebrow>
      <div className={`font-heading text-[22px] mt-1.5 leading-none ${TONE_TEXT[tone] || TONE_TEXT.ink}`}>
        {display}
      </div>
      {hint ? <div className="text-[11px] text-clay-700 mt-2">{hint}</div> : null}
      {state ? (
        <div className="absolute top-3 right-3">
          <StatusDot state={state} label="" />
        </div>
      ) : null}
    </div>
  );
}

const READINESS_HINT = {
  ready: "Locked intelligence is reaching aspirants",
  partial: "Verified data exists, review work outstanding",
  not_ready: "No verified intelligence yet",
};

const READINESS_STATE = {
  ready: "live",
  partial: "partial",
  not_ready: "not-connected",
};

export default function ExamIntelligenceOverviewCards({ overview }) {
  const o = overview || {};
  const t = o.tables || {};
  const syl = t.syllabus_topic_mention || {};
  const pyqTags = t.pyq_question_topic_tag || {};
  const pyqQ = t.pyq_question || {};
  const exams = o.exams || {};
  const coverage = o.topic_coverage || {};
  const readiness = o.user_facing_readiness || {};
  const lowConfidence = o.low_confidence_mappings;
  const staleItems = o.stale_review_items;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label="Active exams"
          value={exams.active ?? 0}
          hint={`${exams.total ?? 0} total`}
          tone="sage"
          state="live"
        />
        <KpiCard
          label="Syllabus · verified"
          value={syl.verified ?? 0}
          hint={`${syl.pending ?? 0} pending`}
          tone="sage"
        />
        <KpiCard
          label="Syllabus · pending"
          value={syl.pending ?? 0}
          tone={syl.pending ? "dusk" : "clay"}
          state={syl.pending ? "partial" : "live"}
        />
        <KpiCard
          label="PYQ tags · verified"
          value={pyqTags.verified ?? 0}
          hint={`${pyqTags.pending ?? 0} pending`}
          tone="sage"
        />
        <KpiCard
          label="PYQ tags · pending"
          value={pyqTags.pending ?? 0}
          tone={pyqTags.pending ? "dusk" : "clay"}
          state={pyqTags.pending ? "partial" : "live"}
        />
        <KpiCard
          label="PYQ Qs · verified"
          value={pyqQ.verified ?? 0}
          hint={`${pyqQ.pending ?? 0} pending`}
          tone="sage"
        />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Topic coverage · locked"
          value={coverage.locked ?? 0}
          hint={`${coverage.total ?? 0} total`}
          tone={coverage.locked ? "sage" : "clay"}
        />
        <KpiCard
          label="Coverage · high-yield"
          value={coverage.high_yield ?? 0}
          hint="Flagged high-yield"
          tone="ink"
        />
        <KpiCard
          label="Low-confidence"
          value={lowConfidence ?? 0}
          hint="Confidence below 0.5"
          tone={lowConfidence ? "dusk" : "clay"}
          state={lowConfidence ? "partial" : "live"}
        />
        <KpiCard
          label="Stale review items"
          value={staleItems ?? 0}
          hint="Pending 14+ days"
          tone={staleItems ? "dusk" : "clay"}
          state={staleItems ? "partial" : "live"}
        />
        <KpiCard
          label="User-facing readiness"
          value={readiness.level ? readiness.level.replaceAll("_", " ") : "—"}
          hint={READINESS_HINT[readiness.level] || "Verified-only contract"}
          tone={readiness.level === "ready" ? "sage" : readiness.level === "partial" ? "clay" : "dusk"}
          state={READINESS_STATE[readiness.level] || "preview"}
        />
      </div>
    </div>
  );
}
