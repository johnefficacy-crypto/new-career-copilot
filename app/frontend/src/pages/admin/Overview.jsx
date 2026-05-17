import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";

// Priority work feeds the new command-center list. Each entry must point
// to a count we already get from /api/admin/overview (no new fetches and
// no new endpoints, per task constraint). Items with a missing or zero
// count fall back to a no-count entry; entries with count === 0 are
// filtered out so the list shows only actual work.
function buildPriorityItems(kpisObj) {
  const get = (key) => {
    const v = kpisObj?.[key];
    return typeof v === "number" ? v : null;
  };
  const items = [
    {
      key: "moderation_p0_open",
      label: "P0 moderation flags",
      count: get("moderation_p0_open"),
      hrefToQueue: "/admin/moderation",
      severity: "blocked",
    },
    {
      key: "copyright_open",
      label: "Open copyright takedowns",
      count: get("copyright_open"),
      hrefToQueue: "/admin/copyright",
      severity: "blocked",
    },
    {
      key: "open_flags",
      label: "Open moderation flags",
      count: get("open_flags"),
      hrefToQueue: "/admin/moderation",
      severity: "pending",
    },
  ];
  const severityRank = { blocked: 0, pending: 1, info: 2 };
  return items
    .filter((it) => typeof it.count === "number" && it.count > 0)
    .sort((a, b) => {
      const sa = severityRank[a.severity] ?? 9;
      const sb = severityRank[b.severity] ?? 9;
      if (sa !== sb) return sa - sb;
      return b.count - a.count;
    })
    .slice(0, 5);
}

function severityBadge(severity) {
  if (severity === "blocked") return { cls: "badge blocker", text: "blocked" };
  if (severity === "pending") return { cls: "badge pending", text: "pending" };
  return { cls: "badge info", text: "info" };
}

export default function AdminOverview() {
  const [data, setData] = useState({ kpis: [], recent_audit: [] });
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get("/api/admin/overview")
      .then(setData)
      .catch((e) => setErr(e));
  }, []);

  const kpisRaw = data.kpis;
  const kpisObj = useMemo(
    () => (kpisRaw && !Array.isArray(kpisRaw) ? kpisRaw : {}),
    [kpisRaw],
  );
  const kpis = Array.isArray(kpisRaw) ? kpisRaw : Object.values(kpisRaw || {});
  const audit = data.recent_audit || [];
  const priorityItems = useMemo(() => buildPriorityItems(kpisObj), [kpisObj]);

  return (
    <div className="stack" data-testid="admin-overview">
      <section className="scrn" data-testid="overview-priority-work" style={{ padding: 0, border: "none" }}>
        <div className="scrn-head">
          <div>
            <div className="lbl">Governance · priority work</div>
            <h2 className="oc-title disp" style={{ fontSize: 22, marginTop: 4 }}>What needs attention</h2>
            <div className="anno" style={{ marginTop: 4 }}>Ranked items first; KPI snapshot follows below.</div>
          </div>
          <span className="scrn-tag">command center</span>
        </div>
        <div className="card">
          {priorityItems.length === 0 ? (
            <div className="card-body">
              <div className="empty" data-testid="priority-work-empty">
                <div className="empty-title">No priority work right now.</div>
                Trust desk is clear. Keep the routine review cadence going.
              </div>
            </div>
          ) : (
            <ul className="stack" style={{ padding: 0, margin: 0, listStyle: "none" }}>
              {priorityItems.map((it) => {
                const sev = severityBadge(it.severity);
                return (
                  <li key={it.key} className="card-body" data-testid={`priority-work-${it.key}`} style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
                    <div className="row" style={{ gap: 8, minWidth: 0 }}>
                      <span className={sev.cls}>{sev.text}</span>
                      <span className="row-ttl">{it.label}</span>
                      <span className="badge neutral">{it.count}</span>
                    </div>
                    <Link className="btn small" to={it.hrefToQueue}>Open queue →</Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="scrn" style={{ padding: 0, border: "none" }}>
        <div className="scrn-head">
          <div>
            <div className="lbl">Governance · overview</div>
            <h2 className="oc-title disp" style={{ fontSize: 22, marginTop: 4 }}>Trust desk</h2>
            <div className="anno" style={{ marginTop: 4 }}>What's flowing through the platform right now.</div>
          </div>
          <span className="scrn-tag">screen · home</span>
        </div>
        {err ? <div className="err-row">Failed to load overview · {err.message}</div> : null}

        <div className="kpi-grid">
          {kpis.map((k, idx) => (
            <div key={k.key || k.label || `kpi-${idx}`} className="field big">
              <div className="field-lbl">{k.label}</div>
              <div className="field-val">{k.value}</div>
              {k.delta ? <div className="field-sub">{k.delta}</div> : null}
            </div>
          ))}
          {!kpis.length ? (
            <div className="field big">
              <div className="field-lbl">no kpis yet</div>
              <div className="field-val">—</div>
              <div className="field-sub">overview endpoint returned empty</div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="scrn" style={{ borderTop: "1px solid var(--rule)" }}>
        <div className="scrn-head">
          <h3 className="oc-title">Recent audit events</h3>
          <Link to="/admin/audit" className="scrn-tag lnk">open audit log →</Link>
        </div>
        <div className="card">
          {audit.length === 0 ? (
            <div className="empty">No audit events yet.</div>
          ) : (
            <table className="t">
              <thead>
                <tr>
                  <th style={{ width: 160 }}>Time</th>
                  <th>Action</th>
                  <th style={{ width: 220 }}>Actor</th>
                </tr>
              </thead>
              <tbody>
                {audit.slice(0, 12).map((e, idx) => (
                  <tr key={e.id || `${e.created_at || "audit"}-${e.action || "event"}-${idx}`}>
                    <td className="num">{(e.created_at || "").slice(0, 19).replace("T", " ")}</td>
                    <td><span className="row-ttl">{e.action}</span></td>
                    <td className="row-sub">{e.actor_email || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="scrn" style={{ borderTop: "1px solid var(--rule)" }}>
        <div className="scrn-head">
          <h3 className="oc-title">Jump to</h3>
          <span className="scrn-tag">quick links</span>
        </div>
        <div className="grid3">
          {[
            { to: "/admin/operations", label: "Operations", sub: "scrape → review → publish" },
            { to: "/admin/recruitments", label: "Recruitment review", sub: "drafts & publish gate" },
            { to: "/admin/eligibility-queue", label: "Promotion queue", sub: "candidates awaiting promote" },
            { to: "/admin/sources", label: "Source registry", sub: "trusted & discovery-only" },
            { to: "/admin/notifications", label: "Notifications", sub: "kill-switch armed" },
            { to: "/admin/audit", label: "Audit trail", sub: "full event log" },
          ].map((q) => (
            <Link key={q.to} to={q.to} className="card" style={{ padding: "12px 14px", textDecoration: "none", color: "inherit" }}>
              <div className="row-ttl">{q.label}</div>
              <div className="row-sub">{q.sub}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="batch-card" data-testid="kill-switch-banner">
        <div className="row" style={{ gap: 6, marginBottom: 6 }}>
          <span className="badge pending">kill-switch armed</span>
        </div>
        <h3 className="oc-title" style={{ fontSize: 16 }}>Notification kill-switch is ready</h3>
        <div className="anno" style={{ marginTop: 4 }}>
          Any super_admin can disable all outbound notifications in under 2 seconds from the Notifications page.
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <Link to="/admin/notifications" className="btn">Configure</Link>
        </div>
      </section>
    </div>
  );
}
