import React from "react";
import { Pencil } from "lucide-react";

export default function PersonaQuestionBankTable({ items, onEdit, onToggleActive }) {
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) {
    return (
      <div className="soft-card rounded-2xl p-5 text-sm text-muted-foreground">
        No questions match the current filter.
      </div>
    );
  }
  return (
    <div className="soft-card rounded-2xl overflow-hidden">
      <table className="w-full text-sm" data-testid="persona-question-bank-table">
        <thead className="bg-clay-50 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <tr>
            <th className="text-left px-4 py-2">Key</th>
            <th className="text-left px-4 py-2">Question</th>
            <th className="text-left px-4 py-2">Type</th>
            <th className="text-left px-4 py-2">Dimension</th>
            <th className="text-right px-4 py-2">Priority</th>
            <th className="text-left px-4 py-2">Active</th>
            <th className="text-right px-4 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id || r.question_key} className="border-t border-clay-100">
              <td className="px-4 py-2 font-mono text-xs">{r.question_key}</td>
              <td className="px-4 py-2 max-w-md">
                <div className="line-clamp-2">{r.question_text}</div>
              </td>
              <td className="px-4 py-2">
                <span className="pill text-[10px] uppercase tracking-wider text-muted-foreground">
                  {(r.data_type || "—").replaceAll("_", " ")}
                </span>
              </td>
              <td className="px-4 py-2 text-xs">{r.target_dimension || "—"}</td>
              <td className="px-4 py-2 text-right tabular-nums">{r.priority ?? "—"}</td>
              <td className="px-4 py-2">
                <span
                  className={`pill text-[10px] uppercase tracking-wider ${
                    r.is_active ? "text-sage-700" : "text-muted-foreground"
                  }`}
                >
                  {r.is_active ? "Active" : "Inactive"}
                </span>
              </td>
              <td className="px-4 py-2 text-right">
                <div className="inline-flex gap-1">
                  <button
                    type="button"
                    onClick={() => onToggleActive && onToggleActive(r)}
                    className="btn btn-ghost text-xs"
                    data-testid={`persona-question-toggle-${r.question_key}`}
                  >
                    {r.is_active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit && onEdit(r)}
                    className="btn btn-ghost h-8 w-8 p-0"
                    aria-label={`Edit ${r.question_key}`}
                    data-testid={`persona-question-edit-${r.question_key}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
