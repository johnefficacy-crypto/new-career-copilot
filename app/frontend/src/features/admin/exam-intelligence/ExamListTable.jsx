import React from "react";
import { StatusBadge } from "../../../shared/ui";

const READINESS_STATUS = {
  ready: "ready",
  partial: "partial",
  not_ready: "missing",
};

export default function ExamListTable({ items, onSelect }) {
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) {
    return (
      <div className="soft-card rounded-2xl p-5 text-sm text-muted-foreground">
        No exams registered yet.
      </div>
    );
  }
  return (
    <div className="soft-card rounded-2xl overflow-hidden">
      <table className="w-full text-sm" data-testid="exam-intel-exam-table">
        <thead className="bg-clay-50 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <tr>
            <th className="text-left px-4 py-2">Slug</th>
            <th className="text-left px-4 py-2">Name</th>
            <th className="text-left px-4 py-2">Type</th>
            <th className="text-right px-4 py-2">Syllabus ✓</th>
            <th className="text-right px-4 py-2">Syllabus ⏳</th>
            <th className="text-right px-4 py-2">Verified topics</th>
            <th className="text-right px-4 py-2">High-yield</th>
            <th className="text-left px-4 py-2">Readiness</th>
            <th className="text-right px-4 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className="border-t border-clay-100">
              <td className="px-4 py-2 font-mono text-xs">{e.slug}</td>
              <td className="px-4 py-2">{e.name}</td>
              <td className="px-4 py-2 text-xs text-muted-foreground">{e.exam_type}</td>
              <td className="px-4 py-2 text-right tabular-nums text-sage-700">{e.syllabus_verified ?? 0}</td>
              <td className="px-4 py-2 text-right tabular-nums text-dusk-700">{e.syllabus_pending ?? 0}</td>
              <td className="px-4 py-2 text-right tabular-nums">
                {e.verified_topic_count ?? 0}
                <span className="text-muted-foreground"> / {e.coverage_total ?? 0}</span>
              </td>
              <td className="px-4 py-2 text-right tabular-nums">{e.high_yield_topic_count ?? 0}</td>
              <td className="px-4 py-2">
                <StatusBadge
                  status={READINESS_STATUS[e.readiness_level] || "missing"}
                  label={(e.readiness_level || "not_ready").replaceAll("_", " ")}
                />
              </td>
              <td className="px-4 py-2 text-right">
                <button
                  type="button"
                  onClick={() => onSelect && onSelect(e)}
                  className="btn btn-ghost text-xs"
                  data-testid={`exam-intel-review-${e.slug}`}
                >
                  Review queue
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
