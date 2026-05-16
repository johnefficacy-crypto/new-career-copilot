import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { Eyebrow, StatusDot, StudyCard, PageHeader } from "../../shared/ui/studyos";

const PERIODS = ["daily", "weekly", "monthly"];

function fmtPct(v) {
  if (v === null || v === undefined) return "—";
  return `${Math.round(Number(v) * 100)}%`;
}

function readTone(score) {
  if (score === null || score === undefined) return "bg-[#F3EEE8] text-[#6E5A4A] border-[#DDCFBE]";
  const p = Number(score) * 100;
  if (p >= 90) return "bg-[#E7F6EA] text-[#1E5A33] border-[#B5DDBF]";
  if (p >= 75) return "bg-[#EEF7FF] text-[#164A7A] border-[#BCD9F4]";
  if (p >= 60) return "bg-[#FFF8E8] text-[#6A4A09] border-[#F1DEAF]";
  if (p >= 40) return "bg-[#FFF0E8] text-[#7A3A1D] border-[#EDC6B1]";
  return "bg-[#FCEBEC] text-[#7A1D2C] border-[#E8B9C1]";
}

export default function WeeklyReview() {
  const [period, setPeriod] = useState("weekly");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const title = period === "daily" ? "Today's Report Card" : period === "weekly" ? "Weekly Report Card" : "Monthly Report Card";

  const load = async (p = period) => {
    try {
      const r = await api.get(`/api/study/report-card?period=${p}`);
      setData(r || null);
      setErr("");
    } catch (e) {
      setErr("Report card unavailable right now.");
      if (process.env.NODE_ENV !== "production") console.error(e);
    }
  };

  const recompute = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/api/study/report-card/compute?period=${period}`);
      setData(r || null);
      setErr("");
    } catch (e) {
      setErr("Could not recompute report card.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load(period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const s = data?.scores || {};
  const scoreCards = useMemo(
    () => [
      { k: "Adherence", v: fmtPct(s.plan_adherence_score), hint: s.label || "No evidence" },
      { k: "Completion", v: fmtPct(s.plan_completion_score), hint: "Completed minutes / planned minutes" },
      { k: "Focus adherence", v: fmtPct(s.focus_adherence_score), hint: "Focus minutes / planned minutes" },
      { k: "Consistency", v: fmtPct(s.consistency_score), hint: "Active days / planned days" },
      { k: "Revision", v: fmtPct(s.revision_completion_score), hint: "Revision tasks completed" },
      { k: "Mock review", v: fmtPct(s.mock_review_score), hint: `Trust: ${data?.evidence_summary?.mock_score_block?.trust_label || "platform_verified"}` },
      { k: "Corrections", v: fmtPct(s.correction_completion_score), hint: "Correction tasks closed" },
      { k: "Backlog Δ", v: `${s.backlog_delta ?? "—"}`, hint: "Backlog movement" },
    ],
    [s, data],
  );

  return (
    <div className="space-y-6" data-testid="weekly-review-page">
      {err && <div className="rounded-xl bg-clay-50 text-clay-800 text-xs px-3 py-2">{err}</div>}

      <PageHeader
        eyebrow="Report Card"
        title={title}
        sub="Deterministic progress analytics from tracked study behavior. No AI judgement, only evidence."
        right={
          <div className="flex gap-2 items-center">
            <StatusDot state="live" label="" />
            <button type="button" onClick={recompute} disabled={busy} className="text-[12px] px-3 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold disabled:opacity-50">
              {busy ? "Recomputing…" : "Recompute"}
            </button>
          </div>
        }
      />

      <div className="soft-card rounded-2xl p-2 inline-flex gap-2">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold ${period === p ? "bg-[#2E2218] text-[#F3EADB]" : "bg-transparent text-[#5D4B3F]"}`}
          >
            {p[0].toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {scoreCards.map((c) => (
          <div key={c.k} className={`rounded-2xl border p-4 ${readTone(c.k === "Adherence" ? s.plan_adherence_score : c.k === "Completion" ? s.plan_completion_score : c.k === "Focus adherence" ? s.focus_adherence_score : c.k === "Consistency" ? s.consistency_score : null)}`}>
            <Eyebrow>{c.k}</Eyebrow>
            <div className="font-heading text-[28px] mt-1 leading-none">{c.v}</div>
            <div className="text-[11px] mt-2 opacity-90">{c.hint}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <StudyCard className="!bg-[#F8FBFF] !border-[#C9DCF2]">
          <Eyebrow>Task execution</Eyebrow>
          <div className="text-sm mt-2">Planned: <b>{data?.planned_tasks ?? 0}</b></div>
          <div className="text-sm">Completed: <b>{data?.completed_tasks ?? 0}</b></div>
          <div className="text-sm">Missed / Skipped / Carried: <b>{data?.missed_tasks ?? 0}</b> / <b>{data?.skipped_tasks ?? 0}</b> / <b>{data?.carried_forward_tasks ?? 0}</b></div>
        </StudyCard>
        <StudyCard className="!bg-[#F4FBF2] !border-[#C9E8C3]">
          <Eyebrow>Time evidence</Eyebrow>
          <div className="text-sm mt-2">Planned minutes: <b>{data?.planned_minutes ?? 0}</b></div>
          <div className="text-sm">Completed minutes: <b>{data?.completed_minutes ?? 0}</b></div>
          <div className="text-sm">Focus minutes: <b>{data?.focus_minutes ?? 0}</b></div>
        </StudyCard>
        <StudyCard className="!bg-[#FFF8F1] !border-[#F0D7B8]">
          <Eyebrow>Mocks and corrections</Eyebrow>
          <div className="text-sm mt-2">Mocks taken / reviewed: <b>{data?.mocks_taken ?? 0}</b> / <b>{data?.mocks_reviewed ?? 0}</b></div>
          <div className="text-sm">Correction tasks created / completed: <b>{data?.correction_tasks_created ?? 0}</b> / <b>{data?.correction_tasks_completed ?? 0}</b></div>
          <div className="text-xs text-muted-foreground mt-2">Source: platform tracked</div>
        </StudyCard>
      </div>
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
        <Link
          to="/app/study/plan"
          className="text-[12px] px-3 py-1.5 rounded-full bg-[#33482F] text-[#F0F5EF] font-semibold inline-flex items-center"
        >
          Preview adaptation →
        </Link>
      </div>
    </StudyCard>
  );
}

// ── User correction checklist ────────────────────────────────────────────
// Three reflective prompts the aspirant should answer when reviewing a week.
// "Answer" is a deep-link into the surface where the change actually
// happens — Plan settings, Subjects, Mocks. "Done" lets the user dismiss
// the prompt for this session (kept in localStorage so a hard refresh
// doesn't repeat the nudge). No fake interactive controls.
function UserCorrectionChecklist({ data }) {
  const items = [
    {
      key: "available-hours",
      t: "Confirm next week's available hours",
      body: `Last week: ${data.hours_studied == null ? "—" : `${data.hours_studied}h`}. Plan target ${data.hours_planned == null ? "—" : `${data.hours_planned}h`}.`,
      to: "/app/study/plan",
      cta: "Open plan settings",
    },
    {
      key: "focus-topic",
      t: "Pick a focus topic to fully clear",
      body:
        data.declined && data.declined.length
          ? "Pick from the declined list above."
          : "Choose a weak topic from your subject tree.",
      to: "/app/study/subjects",
      cta: "Open subjects",
    },
    {
      key: "mock-cadence",
      t: "Mock pace — keep weekly cadence?",
      body: `Mocks taken: ${data.mocks_taken == null ? "—" : data.mocks_taken}. Cadence options: keep, slow, accelerate.`,
      to: "/app/study/mocks",
      cta: "Open mocks",
    },
  ];
  const [dismissed, setDismissed] = React.useState(() => {
    try {
      const raw = window.localStorage.getItem("weeklyReview.checklist.dismissed");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  function dismiss(key) {
    setDismissed((prev) => {
      const next = { ...prev, [key]: new Date().toISOString() };
      try {
        window.localStorage.setItem(
          "weeklyReview.checklist.dismissed",
          JSON.stringify(next),
        );
      } catch {
        /* localStorage disabled — dismiss is session-only */
      }
      return next;
    });
  }
  const visible = items.filter((c) => !dismissed[c.key]);
  return (
    <StudyCard>
      <SectionHeader
        eyebrow="Your turn"
        title="Three quick things from you."
        sub="Engine can adapt task selection; only you can adjust intent and availability."
      />
      {visible.length === 0 ? (
        <p className="text-[12.5px] text-clay-700">
          You’ve cleared this week’s prompts. The list resets next time the
          weekly review recomputes.
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((c) => (
            <li
              key={c.key}
              className="rounded-xl border border-[#E7DECB] bg-[#FBF8F2] p-3"
            >
              <div className="flex items-start gap-3">
                <span className="tick mt-1.5" aria-hidden="true" />
                <div className="flex-1">
                  <div className="text-[13px] font-medium">{c.t}</div>
                  <div className="text-[11.5px] text-clay-700 mt-1">{c.body}</div>
                  <div className="mt-2 flex gap-2">
                    <Link
                      to={c.to}
                      className="text-[11px] px-2.5 py-1 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold inline-flex items-center"
                    >
                      {c.cta} →
                    </Link>
                    <button
                      type="button"
                      onClick={() => dismiss(c.key)}
                      className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-clay-700 font-semibold"
                    >
                      Mark done
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
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
