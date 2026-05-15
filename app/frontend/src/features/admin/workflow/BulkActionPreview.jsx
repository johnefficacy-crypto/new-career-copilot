import React from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

// BulkActionPreview — renders the backend's bulk-dry-run response.
// Plan §6 contract:
//   {
//     selected_ids, action, dry_run: true,
//     result: { eligible_count, blocked_count, blockers: [...] },
//   }
//
// Apply button is only enabled when at least one selected row is
// eligible. Blocked rows are listed with their reason_code so the
// admin sees exactly why each one was skipped.
export default function BulkActionPreview({ dryRun, onApply, disabled }) {
  if (!dryRun) return null;
  const { result, action } = dryRun;
  if (!result) return null;
  const hasEligible = (result.eligible_count || 0) > 0;
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          {action} — preview
        </h3>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1 rounded-lg bg-gray-900 px-3 text-xs font-medium text-white disabled:bg-gray-300"
          onClick={onApply}
          disabled={disabled || !hasEligible}
        >
          Apply to {result.eligible_count} eligible
        </button>
      </header>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Stat label="Eligible" value={result.eligible_count} icon="ok" />
        <Stat label="Blocked" value={result.blocked_count} icon="warn" />
      </div>
      {result.blockers && result.blockers.length > 0 ? (
        <ul className="mt-4 space-y-1 text-xs">
          {result.blockers.map((b) => (
            <li key={b.id} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
              <div>
                <span className="font-mono text-gray-700">{b.id}</span>
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 font-mono text-amber-800">
                  {b.reason_code}
                </span>
                <p className="mt-0.5 text-gray-600">{b.message}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Stat({ label, value, icon }) {
  const cls = icon === "ok"
    ? "text-emerald-700 bg-emerald-50 border-emerald-200"
    : "text-amber-700 bg-amber-50 border-amber-200";
  const Ico = icon === "ok" ? CheckCircle2 : AlertTriangle;
  return (
    <div className={`flex items-center justify-between rounded-xl border px-3 py-2 ${cls}`}>
      <span className="flex items-center gap-2">
        <Ico className="h-4 w-4" aria-hidden="true" />
        {label}
      </span>
      <span className="font-semibold">{value ?? 0}</span>
    </div>
  );
}
