import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trophy } from "lucide-react";
import { api } from "../../lib/api";
import {
  Eyebrow,
  Pill,
  StatusDot,
  StudyCard,
  SectionHeader,
} from "../../shared/ui/studyos";

// ── Helpers ──────────────────────────────────────────────────────────────
const ERROR_ROWS = [
  { k: "concept", label: "Concept gap", color: "#7A3925" },
  { k: "calc", label: "Calculation error", color: "#6F5A22" },
  { k: "time", label: "Time pressure", color: "#524864" },
  { k: "misread", label: "Misread question", color: "#6C5038" },
  { k: "guess", label: "Guesswork", color: "#A68057" },
];

const CORRECTION_LABEL = {
  concept_gap: { label: "Concept gap", tone: "rose" },
  memory_gap: { label: "Memory gap", tone: "amber" },
  careless: { label: "Careless", tone: "clay" },
  speed_issue: { label: "Speed issue", tone: "dusk" },
  option_trap: { label: "Option trap", tone: "outline" },
};

const STATE_PILL = {
  scheduled: { tone: "outline", label: "scheduled" },
  unreviewed: { tone: "amber", label: "unreviewed" },
  reviewed: { tone: "sage", label: "reviewed" },
  correction_drafted: { tone: "sage", label: "corrected" },
};

function pct(m) {
  return Number(m?.percentage ?? 0);
}

// ── Mocks page ───────────────────────────────────────────────────────────
export default function Mocks() {
  const [items, setItems] = useState([]);
  const [trend, setTrend] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    exam_slug: "ssc-cgl-2026",
    score: "",
    max_score: 200,
    duration_min: 60,
    attempted: "",
    correct: "",
    weak: "",
    error_concept: "",
    error_calc: "",
    error_time: "",
    error_misread: "",
    error_guess: "",
  });
  const [err, setErr] = useState("");

  async function loadList() {
    try {
      const d = await api.get("/api/study/mocks");
      const list = Array.isArray(d?.items) ? d.items : [];
      setItems(list);
      setTrend(Array.isArray(d?.trend) ? d.trend : []);
      setSelectedId((prev) => prev ?? (list[0]?.id ?? null));
    } catch (e) {
      setErr("Could not load mocks.");
      if (process.env.NODE_ENV !== "production") console.error(e);
    }
  }

  async function loadAnalysis(id) {
    if (!id) return;
    setLoadingAnalysis(true);
    try {
      const d = await api.get(`/api/study/mocks/${id}/analysis`);
      setAnalysis(d);
    } catch (e) {
      setAnalysis(null);
      if (process.env.NODE_ENV !== "production") console.error(e);
    } finally {
      setLoadingAnalysis(false);
    }
  }

  useEffect(() => {
    loadList();
  }, []);

  useEffect(() => {
    if (selectedId) loadAnalysis(selectedId);
    else setAnalysis(null);
  }, [selectedId]);

  async function submit(e) {
    e.preventDefault();
    const errorPatterns = {};
    ["concept", "calc", "time", "misread", "guess"].forEach((k) => {
      const v = Number(form[`error_${k}`]);
      if (!Number.isNaN(v) && v > 0) errorPatterns[k] = v;
    });
    try {
      await api.post("/api/study/mocks", {
        name: form.name,
        exam_slug: form.exam_slug,
        score: Number(form.score),
        max_score: Number(form.max_score),
        duration_min: Number(form.duration_min),
        attempted: Number(form.attempted),
        correct: Number(form.correct),
        weak_topics: form.weak
          ? form.weak.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        error_patterns: errorPatterns,
      });
      setOpen(false);
      setForm({
        ...form,
        name: "",
        score: "",
        attempted: "",
        correct: "",
        weak: "",
        error_concept: "",
        error_calc: "",
        error_time: "",
        error_misread: "",
        error_guess: "",
      });
      loadList();
    } catch (ex) {
      setErr("Could not log mock.");
      if (process.env.NODE_ENV !== "production") console.error(ex);
    }
  }

  async function changeReviewState(state) {
    if (!selectedId) return;
    try {
      const updated = await api.patch(
        `/api/study/mocks/${selectedId}/review-state`,
        { state },
      );
      setItems((prev) =>
        prev.map((m) => (m.id === selectedId ? { ...m, review_state: updated.review_state } : m)),
      );
      setAnalysis((a) => (a ? { ...a, review_state: updated.review_state } : a));
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.error(e);
    }
  }

  async function draftCorrections() {
    if (!selectedId) return;
    try {
      const out = await api.post(`/api/study/mocks/${selectedId}/correction-tasks`);
      setAnalysis((a) =>
        a ? { ...a, correction_tasks: Array.isArray(out?.items) ? out.items : [], review_state: "correction_drafted" } : a,
      );
      setItems((prev) =>
        prev.map((m) => (m.id === selectedId ? { ...m, review_state: "correction_drafted" } : m)),
      );
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.error(e);
    }
  }

  async function applyCorrection(correctionId) {
    try {
      const updated = await api.post(
        `/api/study/mocks/correction-tasks/${correctionId}/apply`,
      );
      setAnalysis((a) =>
        a
          ? {
              ...a,
              correction_tasks: (a.correction_tasks || []).map((c) =>
                c.id === correctionId ? updated : c,
              ),
            }
          : a,
      );
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.error(e);
    }
  }

  async function dismissCorrection(correctionId) {
    try {
      const updated = await api.post(
        `/api/study/mocks/correction-tasks/${correctionId}/dismiss`,
      );
      setAnalysis((a) =>
        a
          ? {
              ...a,
              correction_tasks: (a.correction_tasks || []).map((c) =>
                c.id === correctionId ? updated : c,
              ),
            }
          : a,
      );
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.error(e);
    }
  }

  const avg = items.length
    ? Math.round(items.reduce((a, b) => a + pct(b), 0) / items.length)
    : 0;
  const best = items.length ? Math.max(...items.map(pct)) : 0;
  const drift = useMemo(() => {
    if (!trend || trend.length < 2) return null;
    return Math.round((trend[trend.length - 1]?.percentage ?? 0) - (trend[0]?.percentage ?? 0));
  }, [trend]);

  return (
    <div className="space-y-6" data-testid="mocks-page">
      <header className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <Eyebrow>Mocks · analysis</Eyebrow>
          <h1 className="font-heading text-[36px] leading-[1.05] mt-2">
            Turn every mock into a correction plan.
          </h1>
          <p className="text-[14px] text-clay-700 mt-2 max-w-[64ch]">
            A mock is just data until you review it. We surface subject breakdowns, error
            patterns, weak topics, and draft correction tasks you can push into today's plan.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusDot state="live" label="Live · /api/study/mocks" />
          <button onClick={() => setOpen(true)} className="btn btn-primary" data-testid="add-mock-btn">
            <Plus className="h-4 w-4" /> Log a mock
          </button>
        </div>
      </header>

      {err ? (
        <div className="rounded-xl bg-clay-50 text-clay-800 text-xs px-3 py-2">{err}</div>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Mocks logged" value={items.length} />
        <Stat label="Average score" value={`${avg}%`} />
        <Stat label="Best" value={items.length ? `${best}%` : "—"} />
        <Stat
          label="Drift"
          value={drift === null ? "—" : `${drift > 0 ? "+" : ""}${drift}%`}
          foot={drift === null ? "Log 2+ mocks" : "First → latest"}
        />
      </div>

      {items.length === 0 ? (
        <StudyCard>
          <div className="text-center py-10">
            <Trophy className="h-6 w-6 text-clay-500 mx-auto" aria-hidden="true" />
            <div className="mt-3 font-heading text-lg">No mocks yet</div>
            <div className="text-sm text-clay-700">
              Once you log a few, the trend chart and analysis will live here.
            </div>
          </div>
        </StudyCard>
      ) : (
        <div className="grid lg:grid-cols-[320px_1fr] gap-6 items-start">
          <MockList items={items} activeId={selectedId} onPick={setSelectedId} />
          <div className="space-y-6">
            {loadingAnalysis ? (
              <StudyCard>
                <div className="h-32 bg-clay-50 rounded animate-pulse" />
              </StudyCard>
            ) : analysis ? (
              <>
                <MockAnalysis
                  bundle={analysis}
                  onChangeReviewState={changeReviewState}
                  onDraftCorrections={draftCorrections}
                />
                {analysis.review_state === "unreviewed" && (analysis.mock?.percentage ?? 0) > 0 ? (
                  <ReviewNudge />
                ) : null}
                <CorrectionTasks
                  items={analysis.correction_tasks || []}
                  onApply={applyCorrection}
                  onDismiss={dismissCorrection}
                />
              </>
            ) : (
              <StudyCard>
                <p className="text-sm text-clay-700">
                  Select a mock from the log to see its analysis.
                </p>
              </StudyCard>
            )}
            <MockScoreTrend points={trend} />
          </div>
        </div>
      )}

      {open && <LogMockModal form={form} setForm={setForm} onClose={() => setOpen(false)} onSubmit={submit} />}
    </div>
  );
}

// ── Mock log sidebar ─────────────────────────────────────────────────────
function MockList({ items, activeId, onPick }) {
  return (
    <StudyCard padded={false}>
      <div className="px-5 pt-5 pb-3">
        <Eyebrow>Mock log · last {items.length}</Eyebrow>
        <h2 className="font-heading text-[18px] mt-1">
          best {items.length ? Math.max(...items.map(pct)) : 0}%
        </h2>
      </div>
      <div className="hairline mx-5" />
      <ul className="px-3 py-3">
        {items.map((m) => {
          const active = m.id === activeId;
          const state = STATE_PILL[m.review_state] || STATE_PILL.unreviewed;
          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onPick(m.id)}
                aria-pressed={active}
                className={`w-full text-left rounded-xl px-3.5 py-3 mb-1 transition ${
                  active ? "bg-[#FFFDF9] text-[#2E2218] border border-[#D9C7A7]" : "hover:bg-clay-50"
                }`}
                data-testid={`mock-row-${m.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-heading text-[15px] ${active ? "" : "text-clay-900"}`}>
                    {m.name}
                  </span>
                  <Pill tone={state.tone}>{state.label}</Pill>
                </div>
                <div
                  className={`flex items-center justify-between mt-1 text-[11.5px] ${
                    active ? "text-clay-700" : "text-clay-700"
                  }`}
                >
                  <span className="num-mono">{m.exam_slug || "—"}</span>
                  <span className="num-mono">
                    {m.score || "—"}/{m.max_score || "—"}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </StudyCard>
  );
}

// ── Analysis main card ───────────────────────────────────────────────────
function MockAnalysis({ bundle, onChangeReviewState, onDraftCorrections }) {
  const m = bundle.mock || {};
  const subjectBreakdown = bundle.subject_breakdown || [];
  const errors = bundle.error_patterns || {};
  const totalErrors = Object.values(errors).reduce((a, b) => a + Number(b || 0), 0);
  const reviewState = bundle.review_state || "unreviewed";

  return (
    <StudyCard data-testid="mock-analysis">
      <SectionHeader
        eyebrow={`Mock · ${(m.attempted_at || "").slice(0, 10) || "logged"}`}
        title={`${m.name} · ${m.score ?? "—"}/${m.max_score ?? "—"}`}
        sub="Subject breakdown and error patterns are extracted from your logged answer sheet."
        right={
          <Pill tone={STATE_PILL[reviewState]?.tone || "amber"}>
            {STATE_PILL[reviewState]?.label || reviewState}
          </Pill>
        }
      />

      <div className="grid md:grid-cols-[1fr_240px] gap-6">
        <div>
          <Eyebrow>Subject breakdown</Eyebrow>
          {subjectBreakdown.length ? (
            <ul className="mt-2 space-y-2">
              {subjectBreakdown.map((r, i) => {
                const total = Number(r.total_questions || 0);
                const correct = Number(r.correct_answers || 0);
                const accuracy = total > 0 ? correct / total : 0;
                const weak = accuracy < 0.6;
                return (
                  <li
                    key={`${r.subject}-${i}`}
                    className="grid grid-cols-[100px_1fr_60px_70px] gap-3 items-center text-[12.5px]"
                  >
                    <span>{r.subject}</span>
                    <div className="h-[6px] bg-[#EFE2C9] rounded-full overflow-hidden">
                      <div
                        className="h-full"
                        style={{
                          width: `${Math.round(accuracy * 100)}%`,
                          background: accuracy >= 0.6 ? "#54794E" : "#A68057",
                        }}
                      />
                    </div>
                    <span className="num-mono text-[11.5px] text-clay-700 text-right">
                      {correct}/{total || "—"}
                    </span>
                    <Pill tone={weak ? "rose" : "sage"}>{weak ? "weak" : "ok"}</Pill>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-[12.5px] text-clay-700">
              No subject-level breakdown logged for this mock.
            </p>
          )}
        </div>

        <div>
          <Eyebrow>Error patterns</Eyebrow>
          <ErrorPatternPanel errors={errors} total={totalErrors} />
        </div>
      </div>

      <div className="rule mt-5 pt-3">
        <Eyebrow>Weak topics surfaced</Eyebrow>
        {Array.isArray(m.weak_topics) && m.weak_topics.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {m.weak_topics.map((w, i) => (
              <Pill key={`${w}-${i}`} tone="rose">
                {w}
              </Pill>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[12.5px] text-clay-700">
            No weak topics tagged for this mock.
          </p>
        )}
      </div>

      <div className="rule mt-4 pt-3 flex gap-2 flex-wrap items-center">
        <button
          type="button"
          onClick={onDraftCorrections}
          className="px-3.5 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold text-[12px]"
        >
          Draft correction tasks
        </button>
        <button
          type="button"
          onClick={() => onChangeReviewState("reviewed")}
          className="px-3.5 py-1.5 rounded-full border border-[#E7DECB] text-clay-700 font-semibold text-[12px]"
        >
          Mark reviewed
        </button>
        {reviewState !== "unreviewed" ? (
          <button
            type="button"
            onClick={() => onChangeReviewState("unreviewed")}
            className="px-3.5 py-1.5 rounded-full border border-[#E7DECB] text-clay-700 font-semibold text-[12px]"
          >
            Reset to unreviewed
          </button>
        ) : null}
      </div>
    </StudyCard>
  );
}

function ErrorPatternPanel({ errors, total }) {
  return (
    <div className="mt-2 space-y-1.5">
      {ERROR_ROWS.map((r) => {
        const v = Number(errors[r.k] || 0);
        return (
          <div
            key={r.k}
            className="grid grid-cols-[1fr_30px] items-center text-[12px]"
          >
            <span className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ background: r.color }}
                aria-hidden="true"
              />
              <span>{r.label}</span>
            </span>
            <span className="num-mono text-right">{v}</span>
          </div>
        );
      })}
      <div className="rule mt-1 pt-1.5 text-[10.5px] text-clay-700">
        {total} wrong answers tagged · pattern weighted in next plan
      </div>
    </div>
  );
}

// ── Review nudge ─────────────────────────────────────────────────────────
function ReviewNudge() {
  return (
    <StudyCard className="!bg-[#2E2218] !border-[#2E2218]">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-[#4E3A29] border border-[#6C5038] grid place-items-center shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 8v5l3 2" stroke="#F3EADB" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="12" cy="12" r="9" stroke="#F3EADB" strokeWidth="1.6" />
          </svg>
        </div>
        <div className="flex-1">
          <Eyebrow dark>Unreviewed mock</Eyebrow>
          <h3 className="font-heading text-[20px] text-[#F3EADB] mt-1.5 leading-snug">
            Review before the next mock.
          </h3>
          <p className="text-[12.5px] text-[#D6BC93] mt-1.5 max-w-[64ch]">
            This mock is logged but not reviewed. Drafting correction tasks now lets the planner
            absorb the gaps before your next attempt. This is a nudge, not a verdict.
          </p>
        </div>
      </div>
    </StudyCard>
  );
}

// ── Correction tasks list ────────────────────────────────────────────────
function CorrectionTasks({ items, onApply, onDismiss }) {
  if (!items || !items.length) return null;
  return (
    <StudyCard>
      <SectionHeader
        eyebrow="Proposed correction tasks"
        title="From this mock → your study plan"
        sub="Push any task into today; dismiss the ones that don't fit."
        right={<StatusDot state="live" label="" />}
      />
      <ul className="space-y-2">
        {items.map((c) => {
          const meta = CORRECTION_LABEL[c.category] || { label: c.category, tone: "outline" };
          const applied = c.state === "applied";
          const dismissed = c.state === "dismissed";
          return (
            <li
              key={c.id}
              className="grid md:grid-cols-[1fr_140px_180px] gap-3 items-center px-3.5 py-2.5 rounded-xl border border-[#EFE2C9] bg-[#FBF6EF]/70"
            >
              <div>
                <div className="text-[13px]">{c.title}</div>
                {c.topic ? (
                  <div className="num-mono text-[10.5px] text-clay-700 mt-1">topic · {c.topic}</div>
                ) : null}
              </div>
              <Pill tone={meta.tone}>{meta.label}</Pill>
              <div className="flex gap-1.5 justify-end flex-wrap">
                {applied ? (
                  <Pill tone="sage">Added to plan</Pill>
                ) : dismissed ? (
                  <Pill tone="outline">Dismissed</Pill>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onApply(c.id)}
                      className="text-[11px] px-2.5 py-1 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold"
                    >
                      Add to plan
                    </button>
                    <button
                      type="button"
                      onClick={() => onDismiss(c.id)}
                      className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-clay-700 font-semibold"
                    >
                      Dismiss
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </StudyCard>
  );
}

// ── Score trend SVG ──────────────────────────────────────────────────────
function MockScoreTrend({ points }) {
  const data = Array.isArray(points) ? points : [];
  const max = 100; // percentage scale
  if (!data.length) return null;
  const xStep = data.length > 1 ? 540 / (data.length - 1) : 540;
  const xy = (i, v) => [40 + i * xStep, 140 - (v / max) * 120];
  const polyline = data
    .filter((p) => p.percentage != null)
    .map((p, i) => xy(i, p.percentage).join(","))
    .join(" ");
  const drift =
    data.length >= 2
      ? Math.round((data[data.length - 1].percentage || 0) - (data[0].percentage || 0))
      : null;
  return (
    <StudyCard>
      <SectionHeader
        eyebrow={`Score trend · last ${data.length}`}
        title={drift === null ? "Log more mocks to see a trend." : `Drift ${drift >= 0 ? "+" : ""}${drift}% across ${data.length} mocks.`}
        right={<StatusDot state="live" label="" />}
      />
      <svg
        viewBox="0 0 600 160"
        className="w-full h-[160px]"
        role="img"
        aria-label="Mock score percentage trend"
      >
        <line x1="40" y1="20" x2="40" y2="140" stroke="#E7DECB" />
        <line x1="40" y1="140" x2="580" y2="140" stroke="#E7DECB" />
        {[25, 50, 75, 100].map((y) => (
          <g key={y}>
            <line
              x1="40"
              y1={140 - (y / max) * 120}
              x2="580"
              y2={140 - (y / max) * 120}
              stroke="#EFE7D4"
              strokeDasharray="2 4"
            />
            <text
              x="32"
              y={140 - (y / max) * 120}
              textAnchor="end"
              dominantBaseline="central"
              fontFamily="'JetBrains Mono', monospace"
              fontSize="10"
              fill="#6C5038"
            >
              {y}%
            </text>
          </g>
        ))}
        {polyline ? (
          <polyline points={polyline} fill="none" stroke="#54794E" strokeWidth="2" />
        ) : null}
        {data.map((p, i) =>
          p.percentage != null ? (
            <g key={p.id || i}>
              <circle cx={xy(i, p.percentage)[0]} cy={xy(i, p.percentage)[1]} r="4" fill="#54794E" />
              <text
                x={xy(i, p.percentage)[0]}
                y={xy(i, p.percentage)[1] - 10}
                textAnchor="middle"
                fontFamily="'JetBrains Mono', monospace"
                fontSize="10"
                fill="#2E2218"
              >
                {Math.round(p.percentage)}
              </text>
              <text
                x={xy(i, p.percentage)[0]}
                y={155}
                textAnchor="middle"
                fontFamily="'JetBrains Mono', monospace"
                fontSize="10"
                fill="#6C5038"
              >
                {(p.name || "").slice(0, 6) || `M${i + 1}`}
              </text>
            </g>
          ) : null,
        )}
      </svg>
    </StudyCard>
  );
}

// ── Stat card ────────────────────────────────────────────────────────────
function Stat({ label, value, foot }) {
  return (
    <div className="soft-card grain relative overflow-hidden rounded-[14px] px-4 py-3.5">
      <Eyebrow>{label}</Eyebrow>
      <div className="font-heading text-[24px] mt-1.5 leading-none">{value}</div>
      {foot ? <div className="text-[11px] text-clay-700 mt-2">{foot}</div> : null}
    </div>
  );
}

// ── Log mock modal ───────────────────────────────────────────────────────
function LogMockModal({ form, setForm, onClose, onSubmit }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <form
        onSubmit={onSubmit}
        className="w-full max-w-lg soft-card rounded-2xl p-6 space-y-4"
        data-testid="mock-form"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-heading text-xl">Log mock</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <F label="Name">
            <input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </F>
          <F label="Exam">
            <select className="input" value={form.exam_slug} onChange={(e) => setForm({ ...form, exam_slug: e.target.value })}>
              {["ssc-cgl-2026", "ibps-po-xv", "rbi-grade-b-2026", "upsc-cse-2026", "sbi-clerk-2026"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </F>
          <F label="Score">
            <input required type="number" className="input" value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} />
          </F>
          <F label="Max score">
            <input required type="number" className="input" value={form.max_score} onChange={(e) => setForm({ ...form, max_score: e.target.value })} />
          </F>
          <F label="Duration (min)">
            <input required type="number" className="input" value={form.duration_min} onChange={(e) => setForm({ ...form, duration_min: e.target.value })} />
          </F>
          <F label="Questions attempted">
            <input required type="number" className="input" value={form.attempted} onChange={(e) => setForm({ ...form, attempted: e.target.value })} />
          </F>
          <F label="Questions correct">
            <input required type="number" className="input" value={form.correct} onChange={(e) => setForm({ ...form, correct: e.target.value })} />
          </F>
          <F label="Weak topics (comma-sep)">
            <input className="input" value={form.weak} onChange={(e) => setForm({ ...form, weak: e.target.value })} />
          </F>
        </div>

        <div>
          <Eyebrow className="mb-2">Error patterns (optional counts)</Eyebrow>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {[
              ["error_concept", "concept"],
              ["error_calc", "calc"],
              ["error_time", "time"],
              ["error_misread", "misread"],
              ["error_guess", "guess"],
            ].map(([k, label]) => (
              <label key={k} className="block">
                <div className="text-[10px] text-clay-700 mb-1 capitalize">{label}</div>
                <input
                  type="number"
                  min="0"
                  className="input"
                  value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" data-testid="mock-save">
            Save
          </button>
        </div>
        <style>{`.input { width:100%; padding: 0.55rem 0.9rem; border-radius: 0.75rem; background: rgba(255,255,255,0.85); border: 1px solid hsl(var(--border)); font-size: 14px; }`}</style>
      </form>
    </div>
  );
}

function F({ label, children }) {
  return (
    <label className="block">
      <Eyebrow className="mb-1">{label}</Eyebrow>
      {children}
    </label>
  );
}
