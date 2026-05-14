import React, { useCallback, useEffect, useState } from "react";
import { Info, ArrowRight } from "lucide-react";
import { api } from "../../../lib/api";
import { StatusBadge, EmptyState } from "../../../shared/ui";

// Live Plan Impact review.
//
// Picks a `reviewed` exam_topic_coverage candidate, asks the backend how
// locking it would reshape the planner-ready topic ranking for that exam
// (deterministic, exam-level — no per-user fan-out), and records a
// hold / stage / approve rollout-gate decision. Recording a decision does
// NOT lock the row — it captures operator intent only.

const RISK_STATUS = { low: "ready", medium: "partial", high: "needs_review" };

const DECISIONS = [
  { value: "hold", label: "Hold for more evidence" },
  { value: "stage", label: "Stage for rollout" },
  { value: "approve", label: "Approve for Study OS" },
];

function RankList({ title, rows, candidateTopicId }) {
  return (
    <div className="rounded-xl bg-clay-50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {title}
      </div>
      {rows.length ? (
        <ol className="mt-2 space-y-1 text-xs">
          {rows.map((r) => (
            <li
              key={r.topic_id}
              className={`flex items-center justify-between gap-2 ${
                r.topic_id === candidateTopicId ? "font-semibold text-sage-800" : ""
              }`}
            >
              <span>
                {r.rank}. {r.topic}
                {r.high_yield ? (
                  <span className="pill pill-sage text-[9px] ml-1"><span>HY</span></span>
                ) : null}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {r.exam_level_score}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">No locked topics yet.</p>
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
      const res = await api.post(
        `/api/admin/exam-intelligence/plan-impact/${encodeURIComponent(selectedId)}/decision`,
        { decision, notes: notes || undefined },
      );
      setSaveMsg(
        res?.coverage_locked
          ? "Approved — coverage row locked into the planner."
          : `Decision saved: ${decision}`,
      );
      await loadImpact(selectedId);
    } catch (e) {
      setError(e?.message || "Could not save decision");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3" data-testid="plan-impact-preview">
      <div className="soft-card rounded-2xl p-4 flex items-start gap-3">
        <Info className="h-5 w-5 text-dusk-600 mt-0.5" aria-hidden="true" />
        <div className="text-sm">
          <div className="font-semibold">How locking a topic reshapes the planner</div>
          <p className="text-muted-foreground mt-1">
            Pick a <span className="font-mono">reviewed</span> coverage row to
            see how locking it would change the planner-ready topic ranking
            for its exam. The ranking is exam-level and deterministic — no
            per-user data. Recording a decision captures intent only; it does
            not lock the row.
          </p>
        </div>
      </div>

      <div className="soft-card rounded-2xl p-4 flex flex-wrap items-end gap-2">
        <label className="text-sm flex-1 min-w-[260px]">
          <span className="text-muted-foreground text-xs">Reviewed coverage candidate</span>
          <select
            className="mt-1 w-full rounded-xl border border-clay-200 px-3 py-2 text-sm"
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
        <button type="button" onClick={loadCandidates} className="btn btn-ghost text-xs">
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-xl bg-dusk-50 text-dusk-800 text-xs px-3 py-2">{error}</div>
      ) : null}

      {!selectedId ? (
        <EmptyState
          icon={Info}
          title="No candidate selected"
          description="Reviewed coverage rows are eligible to be locked. Pick one above to preview its planner impact."
        />
      ) : impactLoading ? (
        <div className="soft-card rounded-2xl p-5 text-sm text-muted-foreground">
          Computing impact…
        </div>
      ) : impact ? (
        <section className="soft-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
                Candidate topic
              </div>
              <div className="mt-1 font-medium">{impact.candidate_topic}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Risk</span>
              <StatusBadge
                status={RISK_STATUS[impact.risk_level] || "missing"}
                label={`${impact.risk_level} risk`}
              />
            </div>
          </div>

          <p className="text-sm text-clay-800">{impact.summary}</p>

          <div className="grid md:grid-cols-2 gap-3">
            <RankList
              title="Before — currently locked"
              rows={impact.before || []}
              candidateTopicId={impact.candidate_topic_id}
            />
            <div className="rounded-xl bg-sage-50 p-3">
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-sage-700 font-semibold">
                After — with this row locked <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </div>
              <ol className="mt-2 space-y-1 text-xs">
                {(impact.after || []).map((r) => (
                  <li
                    key={r.topic_id}
                    className={`flex items-center justify-between gap-2 ${
                      r.topic_id === impact.candidate_topic_id
                        ? "font-semibold text-sage-800"
                        : ""
                    }`}
                  >
                    <span>
                      {r.rank}. {r.topic}
                      {r.high_yield ? (
                        <span className="pill pill-sage text-[9px] ml-1"><span>HY</span></span>
                      ) : null}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {r.exam_level_score}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {impact.changes && impact.changes.length ? (
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
                Changes ({impact.affected_topic_count})
              </div>
              <ul className="mt-2 space-y-1 text-sm">
                {impact.changes.map((c, i) => (
                  <li key={i}>
                    {c.type === "topic_added" ? (
                      <span>
                        <span className="font-medium">{c.topic}</span> enters the
                        ranking at #{c.rank}.
                      </span>
                    ) : (
                      <span>
                        <span className="font-medium">{c.topic}</span> moves{" "}
                        {c.direction} ({c.old_rank} → {c.new_rank}).
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No ranking changes — this row does not shift the planner order.
            </p>
          )}

          <div className="border-t border-clay-100 pt-4">
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
              Rollout decision
            </div>
            {impact.latest_decision ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Last decision: <span className="font-mono">{impact.latest_decision.decision}</span>
                {impact.latest_decision.decided_at
                  ? ` · ${String(impact.latest_decision.decided_at).slice(0, 10)}`
                  : ""}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-3">
              {DECISIONS.map((d) => (
                <label key={d.value} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name="plan-impact-decision"
                    value={d.value}
                    checked={decision === d.value}
                    onChange={() => setDecision(d.value)}
                  />
                  {d.label}
                </label>
              ))}
            </div>
            <textarea
              className="mt-2 w-full rounded-xl border border-clay-200 px-3 py-2 text-sm"
              rows={2}
              placeholder="Optional notes for the decision log"
              value={notes}
              maxLength={500}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={saveDecision}
                disabled={saving}
                className="btn btn-primary text-sm disabled:opacity-50"
                data-testid="plan-impact-save-decision"
              >
                {saving ? "Saving…" : "Save decision"}
              </button>
              {saveMsg ? (
                <span className="text-xs text-sage-700">{saveMsg}</span>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
