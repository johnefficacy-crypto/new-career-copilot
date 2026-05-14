import React, { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";
import { api } from "../../lib/api";

// All optional fields below are read defensively — the weekly-review
// endpoint may or may not return them. Anything missing renders as a calm
// empty state or a clearly-labelled preview rather than fabricated data.
const EMPTY = {
  week_of: "This week",
  hours_studied: 0,
  hours_planned: 0,
  adherence: 0,
  mocks_taken: 0,
  tasks_completed: null,
  tasks_planned: null,
  backlog_start: null,
  backlog_end: null,
  revision_coverage: null,
  mock_trend: [],
  highlights: [],
  corrections: [],
  next_changes: [],
};

function num(v) {
  return v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v);
}

export default function WeeklyReview() {
  const [d, setD] = useState(EMPTY);
  const [err, setErr] = useState("");

  useEffect(() => {
    api
      .get("/api/study/weekly-review")
      .then((res) => {
        const r = res || {};
        setD({
          week_of: r.week_of || "This week",
          hours_studied: num(r.hours_studied) ?? 0,
          hours_planned: num(r.hours_planned) ?? 0,
          adherence: num(r.adherence) ?? 0,
          mocks_taken: num(r.mocks_taken) ?? 0,
          tasks_completed: num(r.tasks_completed),
          tasks_planned: num(r.tasks_planned),
          backlog_start: num(r.backlog_start),
          backlog_end: num(r.backlog_end),
          revision_coverage: num(r.revision_coverage),
          mock_trend: Array.isArray(r.mock_trend) ? r.mock_trend : [],
          highlights: Array.isArray(r.highlights) ? r.highlights : [],
          corrections: Array.isArray(r.corrections) ? r.corrections : [],
          next_changes: Array.isArray(r.next_changes)
            ? r.next_changes
            : Array.isArray(r.plan_changes)
              ? r.plan_changes
              : [],
        });
      })
      .catch((e) => {
        setErr("Weekly review unavailable right now.");
        if (process.env.NODE_ENV !== "production") console.error(e);
      });
  }, []);

  const adherencePct = Math.round((d.adherence || 0) * 100);
  const taskCompletion =
    d.tasks_completed !== null && d.tasks_planned
      ? `${d.tasks_completed}/${d.tasks_planned}`
      : "—";
  const backlogMoved =
    d.backlog_start !== null && d.backlog_end !== null
      ? d.backlog_end - d.backlog_start
      : null;

  return (
    <div className="space-y-6" data-testid="weekly-review-page">
      {err && <div className="text-xs text-clay-700">{err}</div>}
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
          Weekly review · {d.week_of}
        </div>
        <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">The honest panel.</h1>
        <p className="text-muted-foreground mt-1">
          A calm read on the week — what held, what slipped, and what changes next.
        </p>
      </div>

      {/* Headline metrics */}
      <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Stat
          label="Planned vs studied"
          value={`${d.hours_studied}h`}
          foot={`of ${d.hours_planned}h planned`}
        />
        <Stat label="Adherence" value={`${adherencePct}%`} foot="Goal 85%" />
        <Stat
          label="Task completion"
          value={taskCompletion}
          foot={taskCompletion === "—" ? "Not reported" : "Tasks done / planned"}
        />
        <Stat
          label="Mocks taken"
          value={d.mocks_taken}
          foot={d.mock_trend.length ? `trend ${d.mock_trend.slice(-2).join(" → ")}` : "No trend yet"}
        />
        <Stat
          label="Revision coverage"
          value={d.revision_coverage !== null ? `${Math.round(d.revision_coverage * 100)}%` : "—"}
          foot={d.revision_coverage !== null ? "Topics revised on time" : "Not reported"}
        />
      </div>

      {/* Improved / declined */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="soft-card rounded-2xl p-6">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">What improved</div>
          {d.highlights.length ? (
            <ul className="mt-3 space-y-2">
              {d.highlights.map((h, i) => (
                <li key={`${h}-${i}`} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-sage-500 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{typeof h === "string" ? h : h?.message || ""}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Nothing flagged as improved yet — keep logging and the panel fills in.
            </p>
          )}
        </div>
        <div className="soft-card rounded-2xl p-6">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">What declined</div>
          {d.corrections.length ? (
            <ul className="mt-3 space-y-2">
              {d.corrections.map((c, i) => (
                <li key={`${c}-${i}`} className="flex items-start gap-2 text-sm">
                  <AlertCircle className="h-4 w-4 text-clay-500 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{typeof c === "string" ? c : c?.message || ""}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No declines to correct this week. That is a good week.
            </p>
          )}
        </div>
      </div>

      {/* Backlog movement */}
      <div className="soft-card rounded-2xl p-6">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Backlog movement</div>
        {d.backlog_start !== null && d.backlog_end !== null ? (
          <div className="mt-3 flex items-center gap-4">
            <div className="text-center">
              <div className="font-heading text-2xl font-semibold">{d.backlog_start}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Start</div>
            </div>
            <ArrowRight className="h-4 w-4 text-clay-400" aria-hidden="true" />
            <div className="text-center">
              <div className="font-heading text-2xl font-semibold">{d.backlog_end}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">End</div>
            </div>
            <span
              className={`pill ${backlogMoved > 0 ? "pill-clay" : "pill-sage"}`}
            >
              {backlogMoved > 0 ? `+${backlogMoved} carried` : backlogMoved < 0 ? `${backlogMoved} cleared` : "Held steady"}
            </span>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Backlog movement is not reported for this week yet.
          </p>
        )}
      </div>

      {/* What Study OS will change next + plan change preview */}
      <section
        className="soft-card rounded-2xl p-6"
        data-testid="plan-change-preview"
        aria-labelledby="plan-change-heading"
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            id="plan-change-heading"
            className="text-[11px] uppercase tracking-widest text-muted-foreground"
          >
            What Study OS will change next
          </h2>
          {d.next_changes.length ? null : (
            <span className="pill pill-dusk text-[10px]">Preview</span>
          )}
        </div>
        {d.next_changes.length ? (
          <ol className="mt-3 space-y-2">
            {d.next_changes.map((c, i) => (
              <li key={`${i}`} className="flex items-start gap-3 text-sm">
                <span className="font-mono text-xs text-muted-foreground mt-0.5">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{typeof c === "string" ? c : c?.message || c?.change || ""}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No plan changes are scheduled from this review yet. When the planner
            proposes adjustments, they will preview here before they reach your week —
            nothing changes silently.
          </p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, foot }) {
  return (
    <div className="soft-card rounded-2xl p-5">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-2 font-heading text-3xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{foot}</div>
    </div>
  );
}
