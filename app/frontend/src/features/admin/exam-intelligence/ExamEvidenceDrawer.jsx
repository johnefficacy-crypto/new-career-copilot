import React from "react";
import { EvidenceDrawer, SourceTrustBadge, ConfidencePill } from "../../../shared/ui";

// Evidence drawer for a single exam-intelligence review-queue row.
// Read-only: surfaces raw text, source trust, confidence, and any suggested
// topic mapping so the reviewer can make a verify / reject / needs_correction
// decision with full context.
export default function ExamEvidenceDrawer({ row, defaultOpen = false }) {
  if (!row) return null;

  const items = [];
  const rawText = row.raw_text || row.normalized_text;
  if (rawText) items.push({ type: "raw text", label: rawText });
  if (row.evidence_text && row.evidence_text !== rawText) {
    items.push({ type: "evidence", label: row.evidence_text });
  }
  if (row.linked_topic || row.topic) {
    items.push({ type: "linked topic", label: row.linked_topic || row.topic });
  }
  if (row.linked_question || row.question_id) {
    items.push({ type: "linked question", label: row.linked_question || row.question_id });
  }
  if (row.suggested_topic || row.suggested_topic_mapping) {
    items.push({
      type: "suggested mapping",
      label: row.suggested_topic || row.suggested_topic_mapping,
    });
  }

  return (
    <EvidenceDrawer
      label="Evidence"
      items={items}
      defaultOpen={defaultOpen}
      emptyText="No raw evidence captured for this row."
      testId={`exam-evidence-drawer-${row.id}`}
    >
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <SourceTrustBadge status={row.source_trust_status || row.source_type} />
        <ConfidencePill value={row.confidence_score} label="confidence" />
        {row.source_type ? (
          <span className="pill pill-dusk" title="source type">
            <span>{String(row.source_type).replaceAll("_", " ")}</span>
          </span>
        ) : null}
      </div>
    </EvidenceDrawer>
  );
}
