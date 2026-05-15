import React from "react";
import { Info } from "lucide-react";

// ReverificationBatchAlert — single card for a mass-corrigendum
// batch. Plan §7 acceptance: "mass corrigendum surfaced as
// ReverificationBatchAlert (one card, not N)."
export default function ReverificationBatchAlert({ batch, onAcknowledge, disabled }) {
  if (!batch) return null;
  const remaining = batch.remaining_pending ?? 0;
  return (
    <article className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <header className="flex items-start gap-3">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
        <div className="flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            Mass corrigendum detected
          </div>
          <div className="mt-1 font-medium text-amber-950">
            {batch.total_reports_affected} reports affected by{" "}
            <span className="font-mono">{batch.trigger_reason}</span>
          </div>
          <p className="mt-1 text-xs text-amber-900">
            {batch.promoted_to_needs_reverification} already promoted to needs_reverification.
            {remaining > 0
              ? ` ${remaining} pending — acknowledge to continue.`
              : " Batch fully processed."}
          </p>
        </div>
        {remaining > 0 ? (
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-lg bg-amber-700 px-3 text-xs font-semibold text-white hover:bg-amber-800 disabled:bg-amber-300"
            onClick={() => onAcknowledge?.(batch.id)}
            disabled={disabled}
          >
            Acknowledge
          </button>
        ) : null}
      </header>
    </article>
  );
}
