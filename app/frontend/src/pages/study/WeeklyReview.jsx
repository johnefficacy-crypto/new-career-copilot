import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import {
  Eyebrow,
  Pill,
  Chip,
  StatusDot,
  StudyCard,
  SectionHeader,
  PageHeader,
} from "../../shared/ui/studyos";

// All optional fields below are read defensively — the weekly-review
// endpoint may not always populate every field on day-one usage.
const EMPTY = {
  week_of: "This week",
  week_start: null,
  week_end: null,
  hours_studied: 0,
  hours_planned: 0,
  adherence: 0,
  mocks_taken: 0,
  tasks_completed: 0,
  tasks_planned: 0,
  backlog_start: null,
  backlog_end: null,
  revision_coverage: null,
  mock_trend: [],
  highlights: [],
  corrections: [],
  next_changes: [],
  improved: [],
  declined: [],
};

function num(v) {
  return v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v);
}

export default function WeeklyReview() {
  const [d, setD] = useState(EMPTY);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function ingest(res) {
    const r = res || {};
    setD({
      week_of: r.week_of || r.week_start || "This week",
      week_start: r.week_start || null,
      week_end: r.week_end || null,
      hours_studied: num(r.hours_studied) ?? 0,
      hours_planned: num(r.hours_planned) ?? 0,
      adherence: num(r.adherence) ?? 0,
      mocks_taken: num(r.mocks_taken) ?? 0,
      tasks_completed: num(r.tasks_completed) ?? 0,
      tasks_planned: num(r.tasks_planned) ?? 0,
      backlog_start: num(r.backlog_start),
      backlog_end: num(r.backlog_end),
      revision_coverage: num(r.revision_coverage),
      mock_trend: Array.isArray(r.mock_trend) ? r.mock_trend : [],
      highlights: Array.isArray(r.highlights) ? r.highlights : [],
      corrections: Array.isArray(r.corrections) ? r.corrections : [],
      next_changes: Array.isArray(r.next_changes) ? r.next_changes : [],
      improved: Array.isArray(r.improved) ? r.improved : [],
      declined: Array.isArray(r.declined) ? r.declined : [],
    });
  }

  async function load() {
    try {
      ingest(await api.get("/api/study/weekly-review"));
      setErr("");
    } catch (e) {
      setErr("Weekly review unavailable right now.");
      if (process.env.NODE_ENV !== "production") console.error(e);
    }
  }

  async function recompute() {
    setBusy(true);
    try {
      ingest(await api.post("/api/study/weekly-review/compute"));
    } catch (e) {
      setErr("Could not recompute weekly review.");
      if (process.env.NODE_ENV !== "production") console.error(e);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // load is stable for the lifetime of this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const adherencePct = Math.round((d.adherence || 0) * 100);
  const taskCompletion =
    d.tasks_planned > 0 ? `${d.tasks_completed}/${d.tasks_planned}` : "—";
  const backlogMoved =
    d.backlog_start !== null && d.backlog_end !== null
      ? d.backlog_end - d.backlog_start
      : null;
  const mockTrendDelta =
    d.mock_trend.length >= 2
      ? Math.round(
          (d.mock_trend[d.mock_trend.length - 1].percentage || 0) -
            (d.mock_trend[0].percentage || 0),
        )
      : null;

  const cells = [
    {
      k: "Hours studied",
      v: `${d.hours_studied}h`,
      sub: `of ${d.hours_planned}h planned`,
    },
    {
      k: "Adherence",
      v: `${adherencePct}%`,
      sub: "7-day rolling",
    },
    {
      k: "Tasks complete",
      v: taskCompletion,
      sub: "of weekly plan",
    },
    {
      k: "Mocks taken",
      v: d.mocks_taken,
      sub: mockTrendDelta !== null
        ? `trend ${mockTrendDelta > 0 ? "+" : ""}${mockTrendDelta}%`
        : "no trend yet",
    },
    {
      k: "Backlog",
      v:
        backlogMoved === null
          ? "—"
          : `${d.backlog_start} → ${d.backlog_end}`,
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
      k: "Revision cov.",
      v:
        d.revision_coverage !== null
          ? `${Math.round(d.revision_coverage * 100)}%`
          : "—",
      sub: d.revision_coverage !== null ? "target 65%" : "not reported",
    },
  ];

  return (
    <div className="space-y-6" data-testid="weekly-review-page">
      {err && (
        <div className="rounded-xl bg-clay-50 text-clay-800 text-xs px-3 py-2">
          {err}
        </div>
      )}

      <PageHeader
        eyebrow={`Weekly review${d.week_start ? ` · ${d.week_start} → ${d.week_end}` : ""}`}
        title="Close the loop."
        sub="An honest read of last week. We surface what improved, what declined, and what Study OS will change next week — calmly. No streaks. No shame."
        right={
          <div className="flex gap-2 items-center">
            <StatusDot state="live" label="" />
            <button
              type="button"
              onClick={recompute}
              disabled={busy}
              className="text-[12px] px-3 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold disabled:opacity-50"
            >
              {busy ? "Recomputing…" : "Recompute"}
            </button>
          </div>
        }
      />

      {/* Headline metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cells.map((c) => (
          <div
            key={c.k}
            className="soft-card grain relative overflow-hidden rounded-[14px] px-4 py-3.5"
          >
            <Eyebrow>{c.k}</Eyebrow>
            <div className="font-heading text-[24px] mt-1.5 leading-none">{c.v}</div>
            <div className="text-[11px] text-clay-700 mt-2">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Improved / Declined */}
      <div className="grid md:grid-cols-2 gap-6">
        <ImprovedDeclined kind="improved" items={d.improved} highlights={d.highlights} />
        <ImprovedDeclined kind="declined" items={d.declined} highlights={d.corrections} />
      </div>

      {/* Next week changes + correction checklist */}
      <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
        <NextWeekChanges items={d.next_changes} />
        <UserCorrectionChecklist data={d} />
      </div>

      {/* Backlog movement */}
      <BacklogMovementChart start={d.backlog_start} end={d.backlog_end} />

      {/* Review loop explainer */}
      <ReviewLoopExplainer />
    </div>
  );
}

// ── Improved / Declined ──────────────────────────────────────────────────
function ImprovedDeclined({ kind, items, highlights }) {
  const sage = kind === "improved";
  const list = (items && items.length ? items : highlights || []).map((x) =>
    typeof x === "string" ? { label: x } : x,
  );
  return (
    <StudyCard
      className={
        sage
          ? "!bg-[#F0F5EF] !border-[#B9CFAF]"
          : "!bg-[#F2DDD6] !border-[#D9B4A6]"
      }
    >
      <Eyebrow>{sage ? "What improved" : "What declined"}</Eyebrow>
      <h2
        className={`font-heading text-[20px] mt-1.5 ${
          sage ? "text-[#33482F]" : "text-[#7A3925]"
        }`}
      >
        {sage ? "These are working." : "These need attention."}
      </h2>
      {list.length ? (
        <ul className="mt-4 space-y-3">
          {list.map((it, i) => (
            <li
              key={`${kind}-${i}`}
              className="grid grid-cols-[1fr_70px] gap-2 items-baseline"
            >
              <div>
                <div
                  className={`text-[13px] font-medium ${
                    sage ? "text-[#33482F]" : "text-[#7A3925]"
                  }`}
                >
                  {it.label}
                </div>
                {it.note ? (
                  <div
                    className={`text-[11.5px] mt-0.5 ${
                      sage ? "text-[#41603D]" : "text-[#7A3925]/80"
                    }`}
                  >
                    {it.note}
                  </div>
                ) : null}
              </div>
              <div
                className={`text-right num-mono text-[14px] font-semibold ${
                  sage ? "text-[#33482F]" : "text-[#7A3925]"
                }`}
              >
                {it.delta || "—"}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p
          className={`mt-3 text-[12.5px] ${
            sage ? "text-[#41603D]" : "text-[#7A3925]/80"
          }`}
        >
          {sage
            ? "Nothing flagged as improved yet — keep logging and the panel fills in."
            : "No declines to correct this week. That is a good week."}
        </p>
      )}
    </StudyCard>
  );
}

// ── Next week changes ────────────────────────────────────────────────────
function NextWeekChanges({ items }) {
  return (
    <StudyCard data-testid="plan-change-preview">
      <SectionHeader
        eyebrow="What Study OS will change next week"
        title="Preview only. Apply with one click."
        sub="The engine drafts adaptations from this week's signals. Nothing applies until you approve at the top of this page."
        right={<StatusDot state="live" label="" />}
      />
      {items && items.length ? (
        <ul className="space-y-3">
          {items.map((it, i) => (
            <li key={i} className="grid grid-cols-[40px_1fr] gap-3 items-start">
              <div className="num-mono text-[12px] text-clay-700 pt-0.5">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div>
                <div className="text-[13.5px] text-clay-900">{it}</div>
                <div className="mt-1 flex gap-1.5 flex-wrap">
                  <Chip layer="engine">plan-adapt</Chip>
                  <Chip layer="user">weekly-signal</Chip>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-clay-700">
          No plan changes are scheduled from this review yet. When the planner proposes
          adjustments, they will preview here before they reach your week — nothing changes
          silently.
        </p>
      )}
      <div className="rule mt-4 pt-3 flex gap-2 flex-wrap">
        <button className="text-[12px] px-3 py-1.5 rounded-full bg-[#33482F] text-[#F0F5EF] font-semibold">
          Preview adaptation
        </button>
        <button className="text-[12px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-clay-700 font-semibold">
          Discuss with mentor
        </button>
      </div>
    </StudyCard>
  );
}

// ── User correction checklist ────────────────────────────────────────────
function UserCorrectionChecklist({ data }) {
  const items = [
    {
      t: "Confirm next week's available hours",
      body: `Last week: ${data.hours_studied}h. Plan target ${data.hours_planned || "—"}h.`,
    },
    {
      t: "Pick a focus topic to fully clear",
      body:
        data.declined && data.declined.length
          ? "Pick from the declined list above."
          : "Choose a weak topic from your subject tree.",
    },
    {
      t: "Mock pace — keep weekly cadence?",
      body: `Mocks taken: ${data.mocks_taken}. Cadence options: keep, slow, accelerate.`,
    },
  ];
  return (
    <StudyCard>
      <SectionHeader
        eyebrow="Your turn"
        title="Three quick things from you."
        sub="Engine can adapt task selection; only you can adjust intent and availability."
      />
      <ul className="space-y-3">
        {items.map((c, i) => (
          <li
            key={i}
            className="rounded-xl border border-[#E7DECB] bg-[#FBF8F2] p-3"
          >
            <div className="flex items-start gap-3">
              <span className="tick mt-1.5" aria-hidden="true" />
              <div className="flex-1">
                <div className="text-[13px] font-medium">{c.t}</div>
                <div className="text-[11.5px] text-clay-700 mt-1">{c.body}</div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="text-[11px] px-2.5 py-1 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold"
                  >
                    Answer
                  </button>
                  <button
                    type="button"
                    className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-clay-700 font-semibold"
                  >
                    Skip
                  </button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </StudyCard>
  );
}

// ── Backlog movement chart ───────────────────────────────────────────────
function BacklogMovementChart({ start, end }) {
  const hasData = start !== null && end !== null;
  return (
    <StudyCard>
      <SectionHeader
        eyebrow="Backlog movement"
        title="Backlog at the start vs end of the week."
        sub="Goal: end the week with backlog at or below where it started."
        right={<StatusDot state="live" label="" />}
      />
      {hasData ? (
        <svg
          viewBox="0 0 720 160"
          className="w-full h-[160px]"
          role="img"
          aria-label="Backlog movement chart"
        >
          {[0, 1, 2, 3].map((y) => (
            <g key={y}>
              <line x1="40" y1={140 - y * 30} x2="700" y2={140 - y * 30} stroke="#EFE7D4" />
              <text
                x="32"
                y={140 - y * 30}
                textAnchor="end"
                dominantBaseline="central"
                fontFamily="'JetBrains Mono', monospace"
                fontSize="10"
                fill="#6C5038"
              >
                {y}
              </text>
            </g>
          ))}
          {["Start", "End"].map((label, i) => (
            <text
              key={label}
              x={200 + i * 320}
              y={155}
              textAnchor="middle"
              fontFamily="'JetBrains Mono', monospace"
              fontSize="10"
              fill="#6C5038"
            >
              {label}
            </text>
          ))}
          <rect
            x={150}
            y={Math.max(0, 140 - start * 30)}
            width="100"
            height={Math.min(140, start * 30)}
            fill="#A68057"
            rx="3"
          />
          <rect
            x={470}
            y={Math.max(0, 140 - end * 30)}
            width="100"
            height={Math.min(140, end * 30)}
            fill={end > start ? "#7A3925" : "#54794E"}
            rx="3"
          />
          <line
            x1="40"
            y1={140 - start * 30}
            x2="700"
            y2={140 - start * 30}
            stroke="#33482F"
            strokeDasharray="4 3"
          />
          <text
            x="704"
            y={140 - start * 30 - 4}
            fontFamily="'JetBrains Mono', monospace"
            fontSize="10"
            fill="#33482F"
            textAnchor="end"
          >
            start = {start}
          </text>
        </svg>
      ) : (
        <p className="text-[13px] text-clay-700">
          Backlog movement is not reported for this week yet.
        </p>
      )}
      {hasData ? (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Pill tone={end > start ? "rose" : end < start ? "sage" : "outline"}>
            {end > start
              ? `+${end - start} carried`
              : end < start
                ? `${end - start} cleared`
                : "Held steady"}
          </Pill>
          <span className="text-[11px] text-clay-700">
            Daily series unlocks once daily backlog snapshots are persisted.
          </span>
        </div>
      ) : null}
    </StudyCard>
  );
}

// ── Review loop explainer ────────────────────────────────────────────────
function ReviewLoopExplainer() {
  const steps = [
    { k: "Weekly signals", v: "adherence · backlog · revision · mock" },
    { k: "Policy check", v: "availability · constraints · mix targets" },
    { k: "Engine adapt", v: "draft preview compiled" },
    { k: "You approve", v: "applied or kept-current" },
  ];
  return (
    <StudyCard className="!bg-[#2E2218] !border-[#2E2218]">
      <Eyebrow dark>How this becomes next week's plan</Eyebrow>
      <h3 className="font-heading text-[20px] text-[#F3EADB] mt-1.5">
        Weekly signals → Engine → Adapted plan
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        {steps.map((s, i) => (
          <div
            key={s.k}
            className="rounded-xl border border-[#6C5038] p-3 bg-[#4E3A29]/40"
          >
            <div className="num-mono text-[9.5px] text-[#D6BC93] uppercase tracking-[0.16em]">
              {String(i + 1).padStart(2, "0")}
            </div>
            <div className="font-heading text-[15px] text-[#F3EADB] mt-1">
              {s.k}
            </div>
            <div className="text-[11px] text-[#D6BC93] mt-1">{s.v}</div>
          </div>
        ))}
      </div>
    </StudyCard>
  );
}
