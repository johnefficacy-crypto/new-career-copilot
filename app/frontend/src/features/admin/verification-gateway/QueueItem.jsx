import React from "react";
import { lifecyclePill, RECOMMENDED_ACTION_LABEL, TIER_LABELS } from "./lifecycle";

export default function QueueItem({ report, selected, onSelect, onToggleCheck, checked, showCheckbox }) {
  const tier = TIER_LABELS[report?.criticality_tier] || TIER_LABELS.C_STANDARD_LONG_TAIL;
  const pill = lifecyclePill(report);
  const action = RECOMMENDED_ACTION_LABEL[report?.recommended_action] || "→ review";
  const exam = report?.exam_family_key || "";
  return (
    <div
      className={`queue-item${selected ? " selected" : ""}`}
      onClick={() => onSelect?.(report)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(report); } }}
      data-testid={`vgc-queue-${report?.id}`}
      aria-pressed={selected ? "true" : "false"}
    >
      <div className="qi-top">
        {showCheckbox ? (
          <input
            type="checkbox"
            checked={!!checked}
            onChange={(e) => { e.stopPropagation(); onToggleCheck?.(report.id); }}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select report ${report?.id}`}
            data-testid={`vgc-queue-check-${report?.id}`}
          />
        ) : null}
        <span className={`badge ${tier.className}`}>{tier.short}</span>
        <span className={pill.cls}>{pill.text}</span>
      </div>
      <div className="qi-title">
        {report?.id ? <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{report.id.slice(0, 8)}</code> : null}
        {" · "}
        {report?.scrape_queue_id ? `queue ${report.scrape_queue_id.slice(0, 8)}` : null}
        {report?.recruitment_id ? ` · rec ${report.recruitment_id.slice(0, 8)}` : null}
      </div>
      <div className="qi-org">
        {exam ? `exam_family ${exam}` : "exam_family —"} · v{report?.report_version || 1}
      </div>
      <div className="qi-action">{action}</div>
    </div>
  );
}
