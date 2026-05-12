import React from "react";
import { AlertTriangle } from "lucide-react";
import { getBlockerLabel, getBlockerNextAction } from "./adminWorkflowContract";

export default function BlockerList({ blockers = [], empty = "No publish blockers reported." }) {
  if (!blockers?.length) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="space-y-2">
      {blockers.map((code) => (
        <div key={code} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <div className="font-semibold">{getBlockerLabel(code)}</div>
              <div className="mt-1 text-xs">{getBlockerNextAction(code)}</div>
              <code className="mt-2 inline-block rounded bg-white/70 px-1.5 py-0.5 text-[11px] text-muted-foreground">{code}</code>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
