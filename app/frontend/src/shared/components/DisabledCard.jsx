import React from "react";

// PR10 shared "coming soon" affordance for hub grids.
// Renders as a non-interactive card: aria-disabled, no href, no onClick,
// tabIndex=-1 so keyboard users skip it entirely. Visual contrast is
// reduced so it doesn't compete with the live cards beside it.
export default function DisabledCard({ title, subtitle, icon: Icon }) {
  return (
    <div
      role="group"
      aria-disabled="true"
      tabIndex={-1}
      title={subtitle || undefined}
      data-testid="disabled-card"
      className="rounded-2xl border border-border bg-clay-50/60 p-5 text-clay-700/60 select-none cursor-not-allowed"
    >
      <div className="flex items-start gap-3">
        {Icon ? (
          <span
            aria-hidden="true"
            className="h-9 w-9 grid place-items-center rounded-lg bg-white/50 border border-border text-clay-500"
          >
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
        <div className="min-w-0">
          <div className="font-heading text-base font-semibold">{title}</div>
          {subtitle ? (
            <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
