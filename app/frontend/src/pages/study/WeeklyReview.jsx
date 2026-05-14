import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, Eyebrow, PageHeader, SectionHeader, StatusDot } from "../../shared/ui/studyos";

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

// Static explainer — describes the weekly review → engine → plan loop.
const LOOP_STEPS = [
  { k: "Weekly signals", v: "adherence · backlog · revision · mock" },
  { k: "Policy check", v: "availability · constraints · mix targets" },
  { k: "Engine adapt", v: "next-week plan draft compiled" },
  { k: "You approve", v: "applied or kept-current" },
];

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

  const cells = [
    { k: "Planned vs studied", v: `${d.hours_studied}h`, sub: `of ${d.hours_planned}h planned` },
    { k: "Adherence", v: `${adherencePct}%`, sub: "Goal 85%" },
    {
      k: "Task completion",
      v: taskCompletion,
      sub: taskCompletion === "—" ? "Not reported" : "Done / planned",
    },
    {
      k: "Mocks taken",
      v: d.mocks_taken,
      sub: d.mock_trend.length ? `trend ${d.mock_trend.slice(-2).join(" → ")}` : "No trend yet",
    },
    {
      k: "Backlog",
      v: backlogMoved === null ? "—" : `${d.backlog_start} → ${d.backlog_end}`,
      sub:
        backlogMoved === null
          ? "Not reported"
          : backlogMoved > 0
            ? `+${backlogMoved} carried`
            : backlogMoved < 0
              ? `${backlogMoved} cleared`
              : "Held steady",
    },
    {
      k: "Revision coverage",
      v: d.revision_coverage !== null ? `${Math.round(d.revision_coverage * 100)}%` : "—",
      sub: d.revision_coverage !== null ? "Revised on time" : "Not reported",
    },
  ];

  return (
    <div className="space-y-6" data-testid="weekly-review-page">
      {err && <div className="rounded-xl bg-clay-50 text-clay-800 text-xs px-3 py-2">{err}</div>}

      <PageHeader
        eyebrow={`Weekly review · ${d.week_of}`}
        title="Close the loop."
        sub="An honest read of the week — what improved, what declined, and what Study OS will change next. Calmly. No streaks. No shame."
        right={<StatusDot state="live" label="Live · /api/study/weekly-review" />}
      />

      {/* Headline metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cells.map((c) => (
          <div key={c.k} className="soft-card grain relative overflow-hidden rounded-[14px] px-4 py-3.5">
            <Eyebrow>{c.k}</Eyebrow>
            <div className="font-heading text-[24px] mt-1.5 leading-none">{c.v}</div>
            <div className="text-[11px] text-clay-700 mt-2">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Improved / declined */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="!bg-[#F0F5EF] !border-[#B9CFAF]">
          <Eyebrow>What improved</Eyebrow>
          <h2 className="font-heading text-[20px] mt-1.5 text-[#33482F]">These are working.</h2>
          {d.highlights.length ? (
            <ul className="mt-4 space-y-2.5">
              {d.highlights.map((h, i) => (
                <li key={`${i}`} className="flex items-start gap-2 text-[13px] text-[#33482F]">
                  <span className="text-[#54794E] mt-0.5" aria-hidden="true">·</span>
                  <span>{typeof h === "string" ? h : h?.message || ""}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[13px] text-[#41603D]">
              Nothing flagged as improved yet — keep logging and the panel fills in.
            </p>
          )}
        </Card>
        <Card className="!bg-[#F2DDD6] !border-[#D9B4A6]">
          <Eyebrow>What declined</Eyebrow>
          <h2 className="font-heading text-[20px] mt-1.5 text-[#7A3925]">These need attention.</h2>
          {d.corrections.length ? (
            <ul className="mt-4 space-y-2.5">
              {d.corrections.map((c, i) => (
                <li key={`${i}`} className="flex items-start gap-2 text-[13px] text-[#7A3925]">
                  <span className="opacity-60 mt-0.5" aria-hidden="true">·</span>
                  <span>{typeof c === "string" ? c : c?.message || ""}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[13px] text-[#7A3925]/80">
              No declines to correct this week. That is a good week.
            </p>
          )}
        </Card>
      </div>

      {/* What Study OS will change next + plan change preview */}
      <Card data-testid="plan-change-preview">
        <SectionHeader
          eyebrow="What Study OS will change next"
          title="Preview only. Nothing applies silently."
          sub="The engine drafts adaptations from this week's signals — they preview here before they reach your week."
          right={
            d.next_changes.length ? (
              <StatusDot state="live" label="" />
            ) : (
              <span className="stamp stamp-preview">Preview</span>
            )
          }
        />
        {d.next_changes.length ? (
          <ol className="space-y-3">
            {d.next_changes.map((c, i) => (
              <li key={`${i}`} className="grid grid-cols-[40px_1fr] gap-3 items-start">
                <div className="num-mono text-[12px] text-clay-700 pt-0.5">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="text-[13.5px] text-clay-800">
                  {typeof c === "string" ? c : c?.message || c?.change || ""}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[13px] text-clay-700">
            No plan changes are scheduled from this review yet. When the planner proposes
            adjustments, they will preview here before they reach your week.
          </p>
        )}
      </Card>

      {/* Review loop explainer */}
      <Card className="!bg-[#2E2218] !border-[#2E2218]">
        <Eyebrow dark>How this becomes next week's plan</Eyebrow>
        <h3 className="font-heading text-[20px] text-[#F3EADB] mt-1.5">
          Weekly signals → Engine → Adapted plan
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          {LOOP_STEPS.map((s, i) => (
            <div key={i} className="rounded-xl border border-[#6C5038] p-3 bg-[#4E3A29]/40">
              <div className="num-mono text-[9.5px] text-[#D6BC93] uppercase tracking-[0.16em]">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="font-heading text-[15px] text-[#F3EADB] mt-1">{s.k}</div>
              <div className="text-[11px] text-[#D6BC93] mt-1">{s.v}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
