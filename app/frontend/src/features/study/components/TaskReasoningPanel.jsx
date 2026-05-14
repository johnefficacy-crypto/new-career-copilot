import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

const FALLBACK_SUMMARY =
  "Reasoning metadata is limited. This task comes from your active study plan.";

export default function TaskReasoningPanel({ reasoning }) {
  const [open, setOpen] = useState(false);
  const r = reasoning || {};
  const summary = r.summary || FALLBACK_SUMMARY;
  const userSignal = r.user_signal;
  const policySignal = r.study_policy_signal;
  const planSignal = r.plan_signal;
  const evidence = Array.isArray(r.evidence) ? r.evidence : [];

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-clay-700"
        data-testid="task-reasoning-toggle"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        Why this task?
      </button>
      {open ? (
        <div
          className="mt-2 rounded-xl bg-clay-50 p-3 text-xs space-y-1"
          data-testid="task-reasoning-panel"
        >
          <div className="text-clay-800">{summary}</div>
          {userSignal ? (
            <div className="text-muted-foreground">
              <span className="font-semibold text-clay-700">Your signals · </span>
              {userSignal}
            </div>
          ) : null}
          {policySignal ? (
            <div className="text-muted-foreground">
              <span className="font-semibold text-clay-700">Study policy · </span>
              {policySignal}
            </div>
          ) : null}
          {planSignal ? (
            <div className="text-muted-foreground">
              <span className="font-semibold text-clay-700">Plan tag · </span>
              {planSignal}
            </div>
          ) : null}
          {evidence.length ? (
            <div className="pt-1 flex flex-wrap gap-1">
              {evidence.map((e) => (
                <span
                  key={e}
                  className="pill text-[10px] uppercase tracking-wider bg-white border border-clay-200 px-2 py-0.5 rounded-full text-muted-foreground"
                >
                  {String(e).replaceAll("_", " ")}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
