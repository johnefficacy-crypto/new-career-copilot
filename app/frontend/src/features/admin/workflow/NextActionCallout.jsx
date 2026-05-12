import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Info } from "lucide-react";

export default function NextActionCallout({ message, href, actionLabel, tone = "info" }) {
  if (!message) return null;
  const toneClass = tone === "warn"
    ? "border-amber-200 bg-amber-50 text-amber-950"
    : tone === "danger"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : "border-sage-200 bg-sage-50 text-sage-950";
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3 text-sm ${toneClass}`}>
      <div className="flex min-w-0 items-start gap-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div>{message}</div>
      </div>
      {href && actionLabel ? (
        <Link className="btn btn-ghost h-8 bg-white/50 text-xs" to={href}>
          {actionLabel}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
