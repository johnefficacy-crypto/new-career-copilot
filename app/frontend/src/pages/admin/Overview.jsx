import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";

export default function AdminOverview() {
  const [data, setData] = useState({ kpis: [], recent_audit: [] });
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get("/api/admin/overview")
      .then(setData)
      .catch((e) => setErr(e));
  }, []);

  const kpis = Array.isArray(data.kpis) ? data.kpis : Object.values(data.kpis || {});
  const audit = data.recent_audit || [];

  return (
    <div className="stack" data-testid="admin-overview">
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
            { to: "/admin/operations", label: "Operations Console", sub: "scrape → review → publish" },
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
