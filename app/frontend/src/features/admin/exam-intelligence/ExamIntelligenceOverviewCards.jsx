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

export default function ExamIntelligenceOverviewCards({ overview }) {
  const o = overview || {};
  const t = o.tables || {};
  const syl = t.syllabus_topic_mention || {};
  const pyqTags = t.pyq_question_topic_tag || {};
  const pyqQ = t.pyq_question || {};
  const exams = o.exams || {};
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <Card label="Active exams" value={exams.active ?? 0} hint={`${exams.total ?? 0} total`} accent="sage" />
      <Card label="Syllabus · verified" value={syl.verified ?? 0} hint={`${syl.pending ?? 0} pending`} accent="sage" />
      <Card label="Syllabus · pending" value={syl.pending ?? 0} accent={syl.pending ? "dusk" : "clay"} />
      <Card label="PYQ tags · verified" value={pyqTags.verified ?? 0} hint={`${pyqTags.pending ?? 0} pending`} accent="sage" />
      <Card label="PYQ tags · pending" value={pyqTags.pending ?? 0} accent={pyqTags.pending ? "dusk" : "clay"} />
      <Card label="PYQ Qs · verified" value={pyqQ.verified ?? 0} hint={`${pyqQ.pending ?? 0} pending`} accent="sage" />
    </div>
  );
}
