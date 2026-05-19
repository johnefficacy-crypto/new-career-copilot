import React, { useMemo } from "react";
import { Link } from "react-router-dom";

// PR3 reorg: the widget is a strict 3-row strip. Rows that would render
// "0" of anything are hidden, never displayed as 0. Links point at the
// canonical /app/eligibility/* paths (the legacy aliases still work,
// they're just no longer authored here).
export function buildTodayActions({
  topMatches = [],
  pendingDocs = 0,
  inProgressForms = 0,
}) {
  const list = [];
  if (pendingDocs > 0) {
    list.push({
      label: `Resolve ${pendingDocs} pending doc${pendingDocs === 1 ? "" : "s"}`,
      to: "/app/eligibility/tracker",
    });
  }
  if (inProgressForms > 0) {
    list.push({
      label: `Resume ${inProgressForms} in-progress form${inProgressForms === 1 ? "" : "s"}`,
      to: "/app/eligibility/tracker",
    });
  }
  const top = topMatches[0];
  if (top?.next_action && top?.slug) {
    list.push({ label: top.next_action, to: `/app/eligibility/exams/${top.slug}` });
  }
  return list;
}

export default function TodaysActions({
  topMatches = [],
  pendingDocs = 0,
  inProgressForms = 0,
  take = 3,
  showHeader = true,
}) {
  const actions = useMemo(
    () => buildTodayActions({ topMatches, pendingDocs, inProgressForms }).slice(0, take),
    [topMatches, pendingDocs, inProgressForms, take],
  );

  if (actions.length === 0) return null;

  return (
    <div className="soft-card rounded-2xl p-4" data-testid="todays-actions">
      {showHeader && (
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
            Today’s top actions
          </div>
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
