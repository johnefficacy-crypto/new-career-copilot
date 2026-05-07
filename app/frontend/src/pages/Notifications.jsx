import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { api } from "../lib/api";

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

function labelForType(t) {
  const m = {continue_application:"Application",submit_form:"Application",complete_profile:"Profile",study_backlog_recovery:"Study",apply_deadline_urgent:"Deadline",weekly_review_ready:"Weekly Review",monitor_result:"Result Monitoring",prepare_after_submission:"Study"};
  return m[t] || t;
}

export default function Notifications() {
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [priority, setPriority] = useState("");
  const [type, setType] = useState("");

  async function load() {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (unreadOnly) query.set("unread_only", "true");
      if (priority) query.set("priority", priority);
      if (type) query.set("alert_type", type);
      const d = await api.get(`/api/notifications/me${query.toString() ? `?${query}` : ""}`);
      setItems(Array.isArray(d?.items) ? d.items : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load().catch(() => setItems([])); }, [unreadOnly, priority, type]);
  const unreadCount = useMemo(() => items.filter((x) => !x.read).length, [items]);

  async function markRead(id) {
    await api.post("/api/notifications/me/read", { alert_ids: [id] });
    await load();
  }

  async function markAllRead() {
    await api.post("/api/notifications/me/read", {});
    await load();
  }

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
          <p className="text-muted-foreground mt-1">{unreadOnly && unreadCount === 0 ? "You’re caught up." : "Actionable reminders from your recruitment and study workflow."}</p>
        </div>
        <div className="flex gap-2"><a className="btn btn-ghost" href="/app/notifications/preferences">Preferences</a><button className="btn btn-ghost" onClick={markAllRead}>Mark all read</button></div>
      </div>

      <div className="soft-card rounded-2xl p-4 flex gap-3 flex-wrap items-center text-sm">
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} /> Unread only</label>
        <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="">Any priority</option><option value="1">1+</option><option value="2">2+</option><option value="3">3+</option><option value="4">4</option></select>
        <select className="input" value={type} onChange={(e) => setType(e.target.value)}><option value="">Any type</option><option value="continue_application">Continue application</option><option value="submit_form">Submit form</option><option value="prepare_after_submission">Prepare after submission</option><option value="complete_profile">Complete profile</option><option value="study_backlog_recovery">Backlog recovery</option><option value="weekly_review_ready">Weekly review ready</option><option value="monitor_result">Monitor result</option><option value="apply_deadline_urgent">Deadline urgent</option></select>
      </div>

      {loading ? <div>Loading…</div> : items.length === 0 ? <div className="soft-card rounded-2xl p-10 text-center"><Bell className="h-6 w-6 text-clay-500 mx-auto" /><div className="mt-3 font-heading text-lg font-semibold">No next actions yet.</div></div> : (
        <div className="space-y-3">
          {items.map((n) => <div key={n.id} className="soft-card rounded-2xl p-4"><div className="flex justify-between gap-3"><button className="text-left flex-1" onClick={() => openNotification(n)}><div className="font-semibold">{n.title}</div><div className="text-sm text-muted-foreground mt-1">{n.body}</div><div className="text-xs text-muted-foreground mt-2">{labelForType(n.type)} · priority {n.priority} · {n.created_at ? new Date(n.created_at).toLocaleString() : ""}</div></button><div className="flex flex-col items-end gap-2"><span className={`pill ${n.read ? "pill-dusk" : "pill-clay"}`}>{n.read ? "Read" : "Unread"}</span>{!n.read && <button className="text-xs link-under" onClick={() => markRead(n.id)}>Mark read</button>}{n.recruitment_link && <Link className="text-xs link-under" to={n.recruitment_link}>Open recruitment</Link>}</div></div></div>)}
        </div>
      )}
      <style>{`.input { padding:0.45rem 0.65rem; border:1px solid hsl(var(--border)); border-radius:0.5rem; background:white; }`}</style>
    </div>
  );
}
