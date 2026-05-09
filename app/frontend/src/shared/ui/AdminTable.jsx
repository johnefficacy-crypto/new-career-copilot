import React from "react";

export default function AdminTable({ columns = [], rows = [], getRowKey, renderRowActions, emptyMessage = "No records found." }) {
  return (
    <div className="soft-card rounded-2xl overflow-auto">
      <table className="w-full text-sm min-w-[1100px]">
        <thead className="sticky top-0 bg-[#FBF6EF] z-10 border-b border-border">
          <tr>{columns.map((c) => <th key={c.key} className="text-left px-3 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">{c.header}</th>)}{renderRowActions && <th className="text-left px-3 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Actions</th>}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={columns.length + (renderRowActions ? 1 : 0)} className="px-3 py-6 text-sm text-muted-foreground">{emptyMessage}</td></tr> : rows.map((r) => <tr key={getRowKey(r)} className="border-t border-border align-top">{columns.map((c) => <td key={c.key} className="px-3 py-3 leading-6">{c.render ? c.render(r) : r[c.key]}</td>)}{renderRowActions && <td className="px-3 py-3">{renderRowActions(r)}</td>}</tr>)}
        </tbody>
      </table>
    </div>
  );
}
