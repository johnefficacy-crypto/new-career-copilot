import React from "react";

// Session progress — "3 of 7". Fast, no animation theatrics.
export default function OnboardingProgressBar({ progress }) {
  if (!progress) return null;
  const total = progress.total || 7;
  const position = Math.min(progress.position || 0, total);
  const pct = total > 0 ? Math.round((position / total) * 100) : 0;

  return (
    <div data-testid="onboarding-progress" className="w-full">
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
        <span className="font-medium">
          {progress.complete ? "All set" : `${position} of ${total}`}
        </span>
        <span>{progress.complete ? "100%" : `${pct}%`}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-clay-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-sage-500 transition-all duration-200 ease-out"
          style={{ width: `${progress.complete ? 100 : pct}%` }}
        />
      </div>
    </div>
  );
}
