import React from "react";
import { BookOpen } from "lucide-react";
import { StatusBadge } from "../../../shared/ui";

// Renders the `exam_context` block. high_yield_topics is verified-only by
// contract (backend returns locked coverage rows only), so anything shown
// here is safe to present as exam intelligence.
const INTEL_STATUS = {
  verified: "verified",
  partial: "partial",
  none: "not_connected",
};

export default function ExamContextCard({ examContext }) {
  const ec = examContext || {};
  const status = ec.verified_intelligence_status || "none";
  const topics = Array.isArray(ec.high_yield_topics) ? ec.high_yield_topics : [];

  if (!ec.exam && !ec.exam_id) {
    return (
      <section className="soft-card rounded-2xl p-6" data-testid="exam-context-card">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
          <BookOpen className="h-3.5 w-3.5" aria-hidden="true" /> Exam intelligence
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Set a target exam to see verified exam intelligence here.
        </p>
      </section>
    );
  }

  return (
    <section className="soft-card rounded-2xl p-6" data-testid="exam-context-card">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
          <BookOpen className="h-3.5 w-3.5" aria-hidden="true" /> Exam intelligence
        </div>
        <StatusBadge
          status={INTEL_STATUS[status] || "not_connected"}
          label={`${status} intelligence`}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-heading text-lg font-semibold">{ec.exam}</span>
        {ec.exam_family ? (
          <span className="text-sm text-muted-foreground">{ec.exam_family}</span>
        ) : null}
        {ec.days_remaining !== null && ec.days_remaining !== undefined ? (
          <span className="text-sm text-clay-700">
            · {ec.days_remaining} days remaining
          </span>
        ) : null}
      </div>
      {topics.length ? (
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Verified priority topics
          </div>
          <ul className="mt-2 space-y-1.5">
            {topics.map((t, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="text-clay-800">{t.topic}</span>
                <span className="flex items-center gap-2 shrink-0">
                  {t.priority_score !== null && t.priority_score !== undefined ? (
                    <span className="pill pill-sage text-[10px]">
                      priority {Math.round(Number(t.priority_score))}
                    </span>
                  ) : null}
                  <span className="pill pill-sage text-[10px] uppercase tracking-wider">
                    {t.status || "locked"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          {status === "none"
            ? "Verified exam intelligence isn't connected for this exam yet — your plan uses your own progress signals."
            : "No verified priority topics are locked yet. They'll appear here once reviewed and locked."}
        </p>
      )}
    </section>
  );
}
