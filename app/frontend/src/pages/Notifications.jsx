import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import FilterToolbar from "../features/notifications/components/FilterToolbar";
import NotificationList from "../features/notifications/components/NotificationList";
import useNotifications from "../features/notifications/hooks/useNotifications";
import { EmptyState, ErrorState, LoadingSkeleton } from "../shared/ui";

const FILTERS_KEY = "ccp.notifications.filters.v1";
const DEFAULT_FILTERS = { unreadOnly: false, priority: "", type: "" };

function routeForNotification(n) {
  const t = n.type || n.alert_type;
  if (t === "complete_profile") return "/app/profile";
  if (t === "apply_deadline_urgent") return n.recruitment_link || "/app/exams";
  if (t === "continue_application" || t === "submit_form") return "/app/tracker";
  if (t === "prepare_after_submission" || t === "study_backlog_recovery") return "/app/study-plan";
  if (t === "weekly_review_ready") return "/app/study/review";
  if (t === "monitor_result") return n.recruitment_link || "/app/tracker";
  return n.recruitment_link || "/app";
}

export default function Notifications() {
  const nav = useNavigate();
  const [filters, setFilters] = useState(() => {
    try { return { ...DEFAULT_FILTERS, ...(JSON.parse(localStorage.getItem(FILTERS_KEY) || "{}") || {}) }; } catch { return DEFAULT_FILTERS; }
  });
  const { items, loading, error, reload, markRead, markAllRead } = useNotifications(filters);

  useEffect(() => { localStorage.setItem(FILTERS_KEY, JSON.stringify(filters)); }, [filters]);

  const unreadCount = useMemo(() => items.filter((x) => !x.read).length, [items]);

  async function openNotification(n) {
    if (!n.read && n.id) await markRead(n.id);
    nav(routeForNotification(n));
  }

  return (
    <div className="space-y-6" data-testid="notifications-page">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Notification center</div>
          <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">Next actions</h1>
          <p className="text-muted-foreground mt-1">{filters.unreadOnly && unreadCount === 0 ? "You’re caught up." : "Actionable reminders from your recruitment and study workflow."}</p>
        </div>
        <div className="flex gap-2"><a className="btn btn-ghost" href="/app/notifications/preferences">Preferences</a><button className="btn btn-ghost" onClick={markAllRead}>Mark all read</button></div>
      </div>

      <FilterToolbar filters={filters} onChange={setFilters} onReset={() => setFilters(DEFAULT_FILTERS)} />

      {loading ? <LoadingSkeleton variant="card" /> : null}
      {!loading && error ? <ErrorState title="Unable to load notifications" message={error.message || "Please try again."} onRetry={reload} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No next actions yet."
          description="You’ll see reminders here for deadlines, profile steps, and study nudges."
        />
      ) : null}
      {!loading && !error && items.length > 0 ? <NotificationList items={items} onOpen={openNotification} onMarkRead={markRead} /> : null}
    </div>
  );
}
