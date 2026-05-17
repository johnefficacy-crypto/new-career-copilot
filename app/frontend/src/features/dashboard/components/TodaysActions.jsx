import React, { useMemo } from "react";
import { Link } from "react-router-dom";

export function buildTodayActions({
  topMatches = [],
  pendingDocs = 0,
  inProgressForms = 0,
  backlogHigh = false,
  profileCompletion,
}) {
  const list = [];
  if ((profileCompletion?.eligibility_profile?.completion_pct || 0) < 60) {
    list.push({ label: "Complete profile essentials", to: "/app/profile" });
  }
  if (pendingDocs > 0) {
    list.push({ label: `Resolve ${pendingDocs} pending docs`, to: "/app/tracker" });
  } else if (inProgressForms > 0) {
    list.push({
      label: `Resume ${inProgressForms} in-progress form${inProgressForms === 1 ? "" : "s"}`,
      to: "/app/tracker",
    });
  }
  if (topMatches[0]?.next_action && topMatches[0]?.slug) {
    list.push({ label: topMatches[0].next_action, to: `/app/exams/${topMatches[0].slug}` });
  }
  if (backlogHigh) list.push({ label: "Recover study backlog", to: "/app/study/review" });
  list.push({ label: "Start focus session", to: "/app/study/focus" });
  return list;
}

export default function TodaysActions({
  topMatches = [],
  pendingDocs = 0,
  inProgressForms = 0,
  backlogHigh = false,
  profileCompletion,
  take = 3,
  showHeader = true,
}) {
  const full = useMemo(
    () =>
      buildTodayActions({
        topMatches,
        pendingDocs,
        inProgressForms,
        backlogHigh,
        profileCompletion,
      }),
    [topMatches, pendingDocs, inProgressForms, backlogHigh, profileCompletion],
  );
  const actions = full.slice(0, take);
  const extra = Math.max(0, full.length - actions.length);

  return (
    <div className="soft-card rounded-2xl p-4" data-testid="todays-actions">
      {showHeader && (
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
            Today’s top actions
          </div>
          {extra > 0 && (
            <span className="text-[11px] text-muted-foreground">+{extra} more</span>
          )}
        </div>
      )}
      <div className={`${showHeader ? "mt-3 " : ""}grid md:grid-cols-3 gap-2`}>
        {actions.map((a) => (
          <Link
            key={a.label}
            to={a.to}
            className="px-3 py-2 rounded-lg border border-border hover:bg-clay-50 text-sm font-medium"
          >
            {a.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
