import React, { useCallback, useEffect, useState } from "react";
import { Info, ArrowRight } from "lucide-react";
import { api } from "../../../lib/api";
import { StatusBadge, EmptyState } from "../../../shared/ui";
import { Eyebrow, Pill, SectionHeader, StatusDot, StudyCard } from "../../../shared/ui/studyos";

// Live Plan Impact review.
//
// Picks a `reviewed` exam_topic_coverage candidate, asks the backend how
// locking it would reshape the planner-ready topic ranking for that exam
// (deterministic, exam-level — no per-user fan-out), and records a
// hold / stage / approve rollout-gate decision. Recording a decision does
// NOT lock the row — it captures operator intent only.

const RISK_STATUS = { low: "ready", medium: "partial", high: "needs_review" };

// Backend at admin_exam_intelligence.py:889 records approval intent only;
// it does NOT lock the coverage row. Button label reflects that — the
// previous "Approve for Study OS" copy implied a lock action the API
// never performed.
const DECISIONS = [
  { value: "hold", label: "Hold for more evidence" },
  { value: "stage", label: "Stage for rollout" },
  { value: "approve", label: "Record approval intent" },
];

function RankList({ title, rows, candidateTopicId, tone = "neutral" }) {
  const bg = tone === "after" ? "#F0F5EF" : "#FBF8F2";
  const labelColor = tone === "after" ? "#33482F" : "#6C5038";
  return (
    <div
      className="rounded-xl border border-[#E7DECB] p-3.5"
      style={{ background: bg }}
    >
      <div className="eyebrow" style={{ color: labelColor }}>
        {title}
      </div>
      {rows.length ? (
        <ol className="mt-2 space-y-1 text-[12.5px]">
          {rows.map((r) => {
            const active = r.topic_id === candidateTopicId;
            return (
              <li
                key={r.topic_id}
                className={`flex items-center justify-between gap-2 ${
                  active ? "font-semibold text-[#33482F]" : "text-clay-900"
                }`}
              >
                <span className="truncate">
                  <span className="num-mono text-clay-700">{String(r.rank).padStart(2, "0")}.</span>{" "}
                  {r.topic}
                  {r.high_yield ? <Pill tone="sage" className="ml-1">HY</Pill> : null}
                </span>
                <span className="num-mono text-clay-700 shrink-0">{r.exam_level_score}</span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-2 text-[12px] text-clay-700">No locked topics yet.</p>
      )}
    </div>
  );
}

export default function PlanImpactPreview() {
  const [candidates, setCandidates] = useState([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [selectedId, setSelectedId] = useState("");

  const [impact, setImpact] = useState(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [error, setError] = useState("");

  const [decision, setDecision] = useState("hold");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const loadCandidates = useCallback(async () => {
    setCandidatesLoading(true);
    try {
      const d = await api.get(
        "/api/admin/exam-intelligence/topic-coverage?status=reviewed&limit=200",
      );
      setCandidates(d?.items || []);
    } catch {
      setCandidates([]);
    } finally {
      setCandidatesLoading(false);
    }
  }, []);

  const loadImpact = useCallback(async (coverageId) => {
    if (!coverageId) {
      setImpact(null);
      return;
    }
    setImpactLoading(true);
    setError("");
    setSaveMsg("");
    try {
      const d = await api.get(
        `/api/admin/exam-intelligence/plan-impact/${encodeURIComponent(coverageId)}`,
      );
      setImpact(d);
      setDecision(d?.latest_decision?.decision || "hold");
      setNotes("");
    } catch (e) {
      setError(e?.message || "Could not load plan impact");
      setImpact(null);
    } finally {
      setImpactLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  useEffect(() => {
    loadImpact(selectedId);
  }, [selectedId, loadImpact]);

  async function saveDecision() {
    if (!selectedId) return;
    setSaving(true);
    setSaveMsg("");
    setError("");
    try {
      await api.post(
        `/api/admin/exam-intelligence/plan-impact/${encodeURIComponent(selectedId)}/decision`,
        { decision, notes: notes || undefined },
      );
      // Reload first (it clears saveMsg), then set the confirmation so the
      // message survives. Backend records intent only — it does not lock
      // the row. The previous ``res?.coverage_locked`` branch was dead
      // code that implied a lock action the API never performed.
      await loadImpact(selectedId);
      setSaveMsg(`Decision saved: ${decision} (intent only — row remains unlocked)`);
    } catch (e) {
      setError(e?.message || "Could not save decision");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="plan-impact-preview">
      <StudyCard>
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-clay-700 mt-0.5" aria-hidden="true" />
          <div>
            <Eyebrow>How locking a topic reshapes the planner</Eyebrow>
            <p className="text-[13px] text-clay-700 mt-1.5 max-w-[72ch]">
              Pick a <span className="num-mono text-clay-900">reviewed</span> coverage row to see
              how locking it would change the planner-ready topic ranking for its exam. The
              ranking is exam-level and deterministic — no per-user data. Recording a decision
              captures intent only; it does not lock the row.
            </p>
          </div>
        </div>
      </StudyCard>

      <StudyCard>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-[260px]">
            <Eyebrow className="mb-1">Reviewed coverage candidate</Eyebrow>
            <select
              className="w-full rounded-xl border border-[#E7DECB] bg-white/80 px-3 py-2 text-[13px]"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">
                {candidatesLoading ? "Loading…" : "Choose a reviewed coverage row…"}
              </option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.exam || c.exam_slug || "Exam"} · {c.topic || c.topic_id}
                  {c.high_yield ? " (high yield)" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={loadCandidates}
            className="text-[12px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-clay-700 font-semibold"
          >
            Refresh
          </button>
        </div>
      </StudyCard>

      {error ? (
        <div className="rounded-xl bg-[#F2DDD6] text-[#7A3925] text-xs px-3 py-2">{error}</div>
      ) : null}

      {!selectedId ? (
        <EmptyState
          icon={Info}
          title="No candidate selected"
          description="Reviewed coverage rows are eligible to be locked. Pick one above to preview its planner impact."
        />
      ) : impactLoading ? (
        <StudyCard>
          <div className="h-32 bg-clay-50 rounded animate-pulse" />
        </StudyCard>
      ) : impact ? (
        <StudyCard>
          <SectionHeader
            eyebrow="Candidate topic"
            title={impact.candidate_topic || "—"}
            sub={impact.summary}
            right={
              <div className="flex items-center gap-2">
                <StatusDot
                  state={impact.risk_level === "low" ? "live" : impact.risk_level === "medium" ? "partial" : "preview"}
                  label=""
                />
                <StatusBadge
                  status={RISK_STATUS[impact.risk_level] || "missing"}
                  label={`${impact.risk_level} risk`}
                />
              </div>
            }
          />

          <div className="grid md:grid-cols-2 gap-3">
            <RankList
              title="Before · currently locked"
              rows={impact.before || []}
              candidateTopicId={impact.candidate_topic_id}
              tone="neutral"
            />
            <div className="rounded-xl border border-[#B9CFAF] p-3.5" style={{ background: "#F0F5EF" }}>
              <div className="flex items-center gap-1 eyebrow" style={{ color: "#33482F" }}>
                After · with this row locked
                <ArrowRight className="h-3 w-3 ml-1" aria-hidden="true" />
              </div>
              <ol className="mt-2 space-y-1 text-[12.5px]">
                {(impact.after || []).map((r) => {
                  const active = r.topic_id === impact.candidate_topic_id;
                  return (
                    <li
                      key={r.topic_id}
                      className={`flex items-center justify-between gap-2 ${
                        active ? "font-semibold text-[#33482F]" : "text-clay-900"
                      }`}
                    >
                      <span className="truncate">
                        <span className="num-mono text-clay-700">
                          {String(r.rank).padStart(2, "0")}.
                        </span>{" "}
                        {r.topic}
                        {r.high_yield ? <Pill tone="sage" className="ml-1">HY</Pill> : null}
                      </span>
                      <span className="num-mono text-clay-700 shrink-0">{r.exam_level_score}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>

          {impact.changes && impact.changes.length ? (
            <div className="rule mt-4 pt-3">
              <Eyebrow>Changes ({impact.affected_topic_count})</Eyebrow>
              <ul className="mt-2 space-y-1 text-[13px] text-clay-900">
                {impact.changes.map((c, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="num-mono text-clay-700 mt-0.5">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>
                      {c.type === "topic_added" ? (
                        <>
                          <span className="font-medium">{c.topic}</span> enters the ranking at #
                          {c.rank}.
                        </>
                      ) : (
                        <>
                          <span className="font-medium">{c.topic}</span> moves {c.direction} (
                          {c.old_rank} → {c.new_rank}).
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-[13px] text-clay-700">
              No ranking changes — this row does not shift the planner order.
            </p>
          )}

          <div className="rule mt-4 pt-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Eyebrow>Rollout decision</Eyebrow>
              {impact.latest_decision ? (
                <span className="num-mono text-[11px] text-clay-700">
                  Last: {impact.latest_decision.decision}
                  {impact.latest_decision.decided_at
                    ? ` · ${String(impact.latest_decision.decided_at).slice(0, 10)}`
                    : ""}
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Rollout decision">
              {DECISIONS.map((d) => {
                const active = decision === d.value;
                return (
                  <button
                    key={d.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setDecision(d.value)}
                    className={`text-[12px] px-3 py-1.5 rounded-full font-semibold transition border ${
                      active
                        ? "bg-[#FFFDF9] text-[#2E2218] border-[#D9C7A7]"
                        : "bg-white/70 text-clay-700 border-[#E7DECB] hover:bg-clay-50"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            <textarea
              className="mt-3 w-full rounded-xl border border-[#E7DECB] bg-white/80 px-3 py-2 text-[13px]"
              rows={2}
              placeholder="Optional notes for the decision log"
              value={notes}
              maxLength={500}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={saveDecision}
                disabled={saving}
                className="px-4 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold text-[12.5px] disabled:opacity-50"
                data-testid="plan-impact-save-decision"
              >
                {saving ? "Saving…" : "Save decision"}
              </button>
              {saveMsg ? <span className="text-[12px] text-sage-700">{saveMsg}</span> : null}
            </div>
          </div>
        </StudyCard>
      ) : null}
    </div>
  );
}
