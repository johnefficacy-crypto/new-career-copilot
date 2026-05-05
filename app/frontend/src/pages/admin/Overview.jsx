import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, AlertTriangle } from "lucide-react";
import { api } from "../../lib/api";

export default function AdminOverview() {
  const [data, setData] = useState({ kpis: [], recent_audit: [] });

  useEffect(() => {
    api.get("/api/admin/overview").then(setData).catch(() => {});
  }, []);

  return (
    <div className="space-y-6" data-testid="admin-overview">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Governance · overview</div>
        <h1 className="mt-1 font-heading text-4xl font-semibold tracking-tight">Trust desk.</h1>
        <p className="text-muted-foreground mt-1">What's flowing through the platform right now.</p>
      </div>

      <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-4">
        {(Array.isArray(data.kpis) ? data.kpis : Object.values(data.kpis || {})).map((k) => (
          <div key={k.label} className="soft-card rounded-2xl p-5">
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">{k.label}</div>
            <div className="mt-3 font-heading text-3xl font-semibold tracking-tight">{k.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{k.delta}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 soft-card rounded-2xl p-5">
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Recent audit events</div>
          {data.recent_audit.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6">No audit events yet.</div>
          ) : (
            <ul className="mt-4 space-y-2 font-mono text-[12.5px]">
              {data.recent_audit.map((e) => (
                <li key={e.id} className="flex items-start gap-3 py-1.5 border-b border-border last:border-0">
                  <span className="text-muted-foreground w-40 shrink-0 truncate">{e.created_at}</span>
                  <span className="text-clay-600">{e.action}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="truncate">{e.actor_email}</span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/admin/audit" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-foreground/70 hover:text-foreground link-under">
            Open audit log <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="space-y-3">
          {[
            { to: "/admin/recruitments", label: "Recruitment review", sub: "6 active · Phase 2 promotes" },
            { to: "/admin/eligibility-queue", label: "Eligibility queue", sub: "placeholder until Phase 2" },
            { to: "/admin/sources", label: "Source registry", sub: "14 sources watched" },
            { to: "/admin/notifications", label: "Notification controls", sub: "kill-switch available" },
          ].map((q) => (
            <Link key={q.to} to={q.to} className="soft-card rounded-2xl p-4 flex items-center gap-3 hover:border-clay-300 transition">
              <div className="flex-1">
                <div className="font-semibold text-sm">{q.label}</div>
                <div className="text-[11px] text-muted-foreground">{q.sub}</div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </div>

      <div className="soft-card rounded-2xl p-5 flex items-center gap-4">
        <div className="h-10 w-10 rounded-xl bg-amber-100 grid place-items-center">
          <AlertTriangle className="h-5 w-5 text-amber-700" />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-sm">Notification kill-switch is armed</div>
          <div className="text-[11px] text-muted-foreground">Any super_admin can disable all outbound notifications in under 2 seconds.</div>
        </div>
        <Link to="/admin/notifications" className="btn btn-ghost text-xs">Configure</Link>
      </div>
    </div>
  );
}
