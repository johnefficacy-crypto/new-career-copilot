import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { api } from "../../../lib/api";

const FALLBACK_SUMMARY =
  "Reasoning metadata is limited. This task comes from your active study plan.";

// Channelled reasoning from GET /api/study/task-reasoning/:task_id. Each
// channel is kept separate so persona / exam / progress / update signals
// never blur together. persona_signals are backend-sanitised safe phrases —
// not raw dimension labels.
const CHANNELS = [
  { key: "user_signals", label: "Your signals" },
  { key: "persona_signals", label: "Study policy" },
  { key: "exam_signals", label: "Exam intelligence" },
  { key: "update_signals", label: "Updates" },
];

const TRACE_LAYER_TONE = {
  user: "bg-sage-50 text-sage-800 border-sage-200",
  exam: "bg-clay-50 text-clay-800 border-clay-200",
  competition: "bg-dusk-50 text-dusk-800 border-dusk-200",
  engine: "bg-amber-50 text-amber-800 border-amber-200",
  plan: "bg-white text-clay-800 border-clay-200",
};

function DetailView({ detail }) {
  const r = detail.reasoning || {};
  const evidence = Array.isArray(detail.evidence) ? detail.evidence : [];
  const trace = Array.isArray(detail.reasoning_trace) ? detail.reasoning_trace : [];
  return (
    <div
      className="mt-2 rounded-xl bg-clay-50 p-3 text-xs space-y-2"
      data-testid="task-reasoning-panel"
    >
      {detail.safe_user_copy ? (
        <div className="text-clay-800">{detail.safe_user_copy}</div>
      ) : null}
      {CHANNELS.map(({ key, label }) => {
        const signals = Array.isArray(r[key]) ? r[key].filter(Boolean) : [];
        if (!signals.length) return null;
        return (
          <div key={key} className="text-muted-foreground">
            <span className="font-semibold text-clay-700">{label} · </span>
            {signals.join(" ")}
          </div>
        );
      })}
      {r.planner_action ? (
        <div className="text-muted-foreground">
          <span className="font-semibold text-clay-700">Planner · </span>
          {r.planner_action}
        </div>
      ) : null}
      {trace.length ? (
        <div className="pt-1.5 space-y-1" data-testid="reasoning-trace">
          <div className="text-[10px] uppercase tracking-wider text-clay-700">Reasoning trace</div>
          {trace.map((row, i) => (
            <div
              key={`${row.rule_key}-${i}`}
              className={`flex items-start gap-2 rounded-md border px-2 py-1 ${
                TRACE_LAYER_TONE[row.layer] || "bg-white border-clay-200"
              }`}
            >
              <span className="num-mono text-[9px] uppercase tracking-wider shrink-0">
                {row.layer}
              </span>
              <span className="flex-1">{row.label}</span>
              {row.confidence != null ? (
                <span className="num-mono text-[9px] shrink-0">
                  {Math.round(row.confidence * 100)}%
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {evidence.length ? (
        <div className="pt-1 flex flex-wrap gap-1">
          {evidence.map((e, i) => (
            <span
              key={i}
              className="pill text-[10px] uppercase tracking-wider bg-white border border-clay-200 px-2 py-0.5 rounded-full text-muted-foreground"
            >
              {e.label}
              {e.value !== undefined && e.value !== null ? `: ${e.value}` : ""}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FallbackView({ reasoning }) {
  const r = reasoning || {};
  const summary = r.summary || FALLBACK_SUMMARY;
  const userSignal = r.user_signal;
  const policySignal = r.study_policy_signal;
  const planSignal = r.plan_signal;
  const evidence = Array.isArray(r.evidence) ? r.evidence : [];
  return (
    <div
      className="mt-2 rounded-xl bg-clay-50 p-3 text-xs space-y-1"
      data-testid="task-reasoning-panel"
    >
      <div className="text-clay-800">{summary}</div>
      {userSignal ? (
        <div className="text-muted-foreground">
          <span className="font-semibold text-clay-700">Your signals · </span>
          {userSignal}
        </div>
      ) : null}
      {policySignal ? (
        <div className="text-muted-foreground">
          <span className="font-semibold text-clay-700">Study policy · </span>
          {policySignal}
        </div>
      ) : null}
      {planSignal ? (
        <div className="text-muted-foreground">
          <span className="font-semibold text-clay-700">Plan tag · </span>
          {planSignal}
        </div>
      ) : null}
      {evidence.length ? (
        <div className="pt-1 flex flex-wrap gap-1">
          {evidence.map((e) => (
            <span
              key={e}
              className="pill text-[10px] uppercase tracking-wider bg-white border border-clay-200 px-2 py-0.5 rounded-full text-muted-foreground"
            >
              {String(e).replaceAll("_", " ")}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Lazily fetches the detailed task-reasoning on first expand. Falls back to
// the inline reasoning attached by mission-control if the fetch fails or no
// task id is available.
export default function TaskReasoningPanel({ taskId, fallbackReasoning }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && !detail && !loading && !failed && taskId) {
      setLoading(true);
      try {
        const d = await api.get(
          `/api/study/task-reasoning/${encodeURIComponent(taskId)}`,
        );
        setDetail(d || null);
        if (!d) setFailed(true);
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-clay-700"
        data-testid="task-reasoning-toggle"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        Why this task?
      </button>
      {open ? (
        loading ? (
          <div className="mt-2 rounded-xl bg-clay-50 p-3 text-xs text-muted-foreground">
            Loading reasoning…
          </div>
        ) : detail ? (
          <DetailView detail={detail} />
        ) : (
          <FallbackView reasoning={fallbackReasoning} />
        )
      ) : null}
    </div>
  );
}
