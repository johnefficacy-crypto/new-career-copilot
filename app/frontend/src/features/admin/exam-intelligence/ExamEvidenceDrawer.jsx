import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { EvidenceDrawer, SourceTrustBadge, ConfidencePill } from "../../../shared/ui";

// Evidence drawer for a single exam-intelligence review-queue row.
// Fetches GET /api/evidence/{kind}/{id} when opened. Renders ONLY fields
// the backend returns — never invents UI-only fallbacks for fields the
// row doesn't carry, since the drawer is reviewer tooling and an
// invented value would actively mislead a verify/reject decision.

// Maps an evidence row's canonical fields → display items, per kind.
// The drawer never renders a field that isn't in this mapping.
function projectByKind(kind, row) {
  if (!row) return [];
  const items = [];
  const push = (type, value) => {
    if (value === null || value === undefined || value === "") return;
    items.push({ type, label: String(value) });
  };

  if (kind === "syllabus_topic_mention") {
    push("raw text", row.raw_text);
    push("normalized text", row.normalized_text);
    push("mention type", row.mention_type);
    push("topic id", row.topic_id);
    push("reviewer notes", row.reviewer_notes);
  } else if (kind === "pyq_question_topic_tag") {
    push("question id", row.pyq_question_id || row.question_id);
    push("topic id", row.topic_id);
    push("tag role", row.tag_role);
    push("tag weight", row.tag_weight);
  } else if (kind === "pyq_question") {
    push("question text", row.question_text);
    push("year", row.year);
    push("source url", row.source_url);
  } else if (kind === "pyq_option") {
    push("question id", row.question_id);
    push("option label", row.option_label);
    push("option text", row.option_text);
    push("is correct", row.is_correct ? "Yes" : "No");
  } else if (kind === "exam_topic_coverage") {
    push("coverage depth", row.coverage_depth);
    push("expected difficulty", row.expected_difficulty);
    push("source basis", row.source_basis);
    push("review notes", row.review_notes);
    push("priority score", row.exam_priority_score);
    push("high yield", row.is_high_yield ? "Yes" : "No");
  } else if (kind === "exam_policy_updates") {
    push("title", row.title);
    push("summary", row.summary);
    push("source url", row.source_url);
    push("source type", row.source_type);
    push("change summary", JSON.stringify(row.change_summary || {}));
  } else if (kind === "exam_competition_metrics") {
    push("source basis", row.source_basis);
    push("evidence count", row.evidence_count);
    push("competition pressure score", row.competition_pressure_score);
    push("reviewer notes", row.reviewer_notes);
  }
  return items;
}

// Map a review-queue row's ``kind`` to the evidence-endpoint kind.
// In practice these are identical for every reviewable kind, but the
// indirection keeps a future divergence cheap.
function evidenceKindFor(reviewKind) {
  return reviewKind || null;
}

export default function ExamEvidenceDrawer({ row, kind, defaultOpen = false }) {
  const evKind = useMemo(() => evidenceKindFor(kind), [kind]);
  const rowId = row?.id || null;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!evKind || !rowId) return;
      setLoading(true);
      setError("");
      try {
        const res = await api.get(
          `/api/evidence/${encodeURIComponent(evKind)}/${encodeURIComponent(rowId)}`,
        );
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) {
          setData(null);
          setError(e?.message || "Could not load evidence");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [evKind, rowId]);

  const items = useMemo(() => {
    if (!data) return [];
    return projectByKind(evKind, data.row || {});
  }, [evKind, data]);

  if (!row) return null;
  const trust = data?.trust || {};

  return (
    <EvidenceDrawer
      label="Evidence"
      items={items}
      defaultOpen={defaultOpen}
      emptyText="No evidence fields available for this row."
      testId={`exam-evidence-drawer-${row.id}`}
    >
      {loading ? (
        <p className="text-muted-foreground" data-testid="evidence-loading">
          Loading evidence…
        </p>
      ) : null}
      {error ? (
        <p className="text-[#7A3925]" role="alert" data-testid="evidence-error">
          Could not load evidence: {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <SourceTrustBadge status={trust.status || row.reviewer_status} />
        <ConfidencePill
          value={trust.confidence_score ?? row.confidence_score}
          label="confidence"
        />
        {trust.reviewed_at ? (
          <span className="pill pill-dusk" title="reviewed at">
            <span className="num-mono">{String(trust.reviewed_at).slice(0, 10)}</span>
          </span>
        ) : null}
      </div>
    </EvidenceDrawer>
  );
}
