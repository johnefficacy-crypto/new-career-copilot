import React from "react";

function Card({ label, value, hint, accent = "clay" }) {
  const accentClass =
    accent === "sage"
      ? "text-sage-600"
      : accent === "dusk"
        ? "text-dusk-600"
        : "text-clay-600";
  return (
    <div className="soft-card rounded-2xl p-4" data-testid={`exam-intel-card-${label}`}>
      <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
        {label}
      </div>
      <div className={`mt-1 font-heading text-2xl font-semibold ${accentClass}`}>
        {value === null || value === undefined ? "—" : value}
      </div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

const READINESS_HINT = {
  ready: "Locked intelligence is reaching aspirants",
  partial: "Verified data exists, review work outstanding",
  not_ready: "No verified intelligence yet",
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
        <Card label="Active exams" value={exams.active ?? 0} hint={`${exams.total ?? 0} total`} accent="sage" />
        <Card label="Syllabus · verified" value={syl.verified ?? 0} hint={`${syl.pending ?? 0} pending`} accent="sage" />
        <Card label="Syllabus · pending" value={syl.pending ?? 0} accent={syl.pending ? "dusk" : "clay"} />
        <Card label="PYQ tags · verified" value={pyqTags.verified ?? 0} hint={`${pyqTags.pending ?? 0} pending`} accent="sage" />
        <Card label="PYQ tags · pending" value={pyqTags.pending ?? 0} accent={pyqTags.pending ? "dusk" : "clay"} />
        <Card label="PYQ Qs · verified" value={pyqQ.verified ?? 0} hint={`${pyqQ.pending ?? 0} pending`} accent="sage" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card
          label="Topic coverage · locked"
          value={coverage.locked ?? 0}
          hint={`${coverage.total ?? 0} total`}
          accent={coverage.locked ? "sage" : "clay"}
        />
        <Card label="Coverage · high-yield" value={coverage.high_yield ?? 0} hint="Flagged high-yield" />
        <Card
          label="Low-confidence mappings"
          value={lowConfidence ?? 0}
          hint="Confidence below 0.5"
          accent={lowConfidence ? "dusk" : "clay"}
        />
        <Card
          label="Stale review items"
          value={staleItems ?? 0}
          hint="Pending 14+ days"
          accent={staleItems ? "dusk" : "clay"}
        />
        <Card
          label="User-facing readiness"
          value={readiness.level ? readiness.level.replaceAll("_", " ") : "—"}
          hint={READINESS_HINT[readiness.level] || "Verified-only contract"}
          accent={
            readiness.level === "ready" ? "sage" : readiness.level === "partial" ? "clay" : "dusk"
          }
        />
      </div>
    </div>
  );
}
