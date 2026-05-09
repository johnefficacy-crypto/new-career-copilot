import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { StatusBadge } from "../../../shared/ui";

function labelForType(t) {
  const m = { continue_application: "Application", submit_form: "Application", complete_profile: "Profile", study_backlog_recovery: "Study", apply_deadline_urgent: "Deadline", weekly_review_ready: "Weekly Review", monitor_result: "Result Monitoring", prepare_after_submission: "Study" };
  return m[t] || t;
}

function getDateLabel(createdAt) {
  if (!createdAt) return "Unknown date";
  const d = new Date(createdAt);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return "Today";
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export default function NotificationList({ items, onOpen, onMarkRead }) {
  const groups = useMemo(() => {
    const map = new Map();
    items.forEach((n) => {
      const label = getDateLabel(n.created_at);
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(n);
    });
    return Array.from(map.entries());
  }, [items]);

  return (
    <div className="space-y-4">
      {groups.map(([label, entries]) => (
        <section key={label} className="space-y-2">
          <h2 className="text-xs uppercase tracking-[0.22em] text-muted-foreground font-semibold">{label}</h2>
          {entries.map((n) => (
            <div key={n.id} className="soft-card rounded-2xl p-4">
              <div className="flex justify-between gap-3">
                <button className="text-left flex-1" onClick={() => onOpen(n)}>
                  <div className="font-semibold">{n.title}</div>
                  <div className="text-sm text-muted-foreground mt-1">{n.body}</div>
                  <div className="text-xs text-muted-foreground mt-2">{labelForType(n.type)} · priority {n.priority} · {n.created_at ? new Date(n.created_at).toLocaleString() : ""}</div>
                </button>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={n.read ? "read" : "unread"} />
                  {!n.read && <button className="text-xs link-under" onClick={() => onMarkRead(n.id)}>Mark read</button>}
                  {n.recruitment_link && <Link className="text-xs link-under" to={n.recruitment_link}>Open recruitment</Link>}
                </div>
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
