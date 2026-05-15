import React from "react";
import { X } from "lucide-react";
import AdminActionChecklist from "./AdminActionChecklist";

// WorkflowDetailsDrawer — holds the full checklist that the default
// view hides. Per plan §7: "move full checklist to: Workflow Details
// drawer". Opens from CurrentActionCard's "View workflow details".
export default function WorkflowDetailsDrawer({ open, onClose, state, checklist }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label="Workflow details">
      <button
        type="button"
        aria-label="Close drawer"
        className="absolute inset-0 bg-gray-900/30"
        onClick={onClose}
      />
      <aside className="relative h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl">
        <header className="flex items-center justify-between border-b border-gray-100 pb-3">
          <h2 className="text-base font-semibold text-gray-900">Workflow details</h2>
          <button
            type="button"
            className="rounded-full p-1 text-gray-500 hover:bg-gray-100"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="mt-4">
          {checklist ? (
            <AdminActionChecklist items={checklist} />
          ) : (
            <p className="text-sm text-gray-500">No checklist available.</p>
          )}
        </div>
        {state ? (
          <details className="mt-4 text-xs text-gray-600">
            <summary className="cursor-pointer text-gray-500">Raw state</summary>
            <pre className="mt-2 overflow-x-auto rounded bg-gray-50 p-2 font-mono">
              {JSON.stringify(state, null, 2)}
            </pre>
          </details>
        ) : null}
      </aside>
    </div>
  );
}
