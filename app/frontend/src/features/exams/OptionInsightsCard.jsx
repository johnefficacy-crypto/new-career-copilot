import React, { useEffect, useState } from "react";
import { AlertTriangle, Lightbulb, ShieldCheck } from "lucide-react";

import { api } from "../../lib/api";

/**
 * Aspirant-facing trap-awareness card backed by the materialised
 * option-analytics rollups (admin recompute populates them). Empty
 * states render neutrally rather than hiding so operators get a
 * visible signal that the rollups need a refresh.
 */
export default function OptionInsightsCard({ examSlug, topicId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!examSlug) {
      setData(null);
      return undefined;
    }
    setLoading(true);
    const params = new URLSearchParams();
    if (topicId) params.set("topic_id", topicId);
    const qs = params.toString() ? `?${params.toString()}` : "";
    api
      .get(`/api/exam-intelligence/exams/${examSlug}/option-insights${qs}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError("");
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message || "Failed to load option insights.");
        setData(null);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [examSlug, topicId]);

  if (!examSlug) return null;

  if (loading) {
    return (
      <div
        className="soft-card rounded-2xl p-5"
        data-testid="option-insights-loading"
        aria-busy="true"
      >
        <div className="text-sm text-muted-foreground">
          Loading trap-awareness tips…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="soft-card rounded-2xl p-5"
        data-testid="option-insights-error"
        role="alert"
      >
        <div className="font-heading text-base font-semibold">
          Couldn't load trap-awareness tips
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{error}</p>
      </div>
    );
  }

  const distractors = data?.recurring_distractors || [];
  const tips = data?.elimination_tips || [];
  const hasData = Boolean(data?.has_data);

  return (
    <section
      className="soft-card rounded-2xl p-5"
      data-testid="option-insights-card"
      aria-labelledby="option-insights-heading"
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
            Trap awareness · verified PYQs
          </div>
          <h3
            id="option-insights-heading"
            className="font-heading text-lg font-semibold mt-0.5"
          >
            Distractors examiners reuse
          </h3>
        </div>
        <span
          className="pill pill-sage inline-flex items-center gap-1 text-[11px]"
          title="Built only from verified past papers"
        >
          <ShieldCheck className="h-3 w-3" aria-hidden="true" />
          Verified-only
        </span>
      </header>

      {!hasData ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No trap-awareness insights ready yet. They appear here once admins
          recompute the option-analytics rollups for this exam.
        </p>
      ) : (
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <DistractorsSection distractors={distractors} />
          <EliminationSection tips={tips} />
        </div>
      )}

      <p className="mt-4 text-[11px] text-muted-foreground">
        Source: option-level analytics rollups. Counts and tips are
        computed only from verified past papers.
      </p>
    </section>
  );
}

function DistractorsSection({ distractors }) {
  return (
    <section aria-labelledby="distractors-heading" className="space-y-2">
      <h4
        id="distractors-heading"
        className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-semibold flex items-center gap-1"
      >
        <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Recurring
        distractors
      </h4>
      {distractors.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No recurring distractors recorded for this slice yet.
        </p>
      ) : (
        <ul className="space-y-2" data-testid="distractor-list">
          {distractors.map((d, idx) => (
            <li
              key={`${d.normalized_value || "x"}-${idx}`}
              className="rounded-lg border border-clay-100 bg-clay-50/40 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium truncate">
                  {d.normalized_value || "—"}
                </div>
                <div
                  className="text-[11px] text-muted-foreground whitespace-nowrap"
                  aria-label={`Appeared ${d.occurrence_count} times`}
                >
                  ×{d.occurrence_count}
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{d.tip}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EliminationSection({ tips }) {
  return (
    <section aria-labelledby="elimination-heading" className="space-y-2">
      <h4
        id="elimination-heading"
        className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-semibold flex items-center gap-1"
      >
        <Lightbulb className="h-3 w-3" aria-hidden="true" /> Elimination
        markers
      </h4>
      {tips.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No structural-marker patterns detected for this slice yet.
        </p>
      ) : (
        <ul className="space-y-2" data-testid="elimination-list">
          {tips.map((t) => {
            const pct = Math.round((t.correct_rate || 0) * 100);
            return (
              <li
                key={t.pattern}
                className="rounded-lg border border-clay-100 bg-clay-50/40 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium truncate">
                    {t.display_text}
                  </div>
                  <div
                    className="text-[11px] text-muted-foreground whitespace-nowrap"
                    aria-label={`Correct ${pct} percent of the time`}
                  >
                    {pct}% correct · ×{t.occurrence_count}
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t.tip}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
