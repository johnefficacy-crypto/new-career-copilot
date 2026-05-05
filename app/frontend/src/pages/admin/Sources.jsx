import React, { useEffect, useState } from "react";
import { Database, ExternalLink } from "lucide-react";
import { api } from "../../lib/api";

export default function AdminSources() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    api.get("/api/admin/sources").then((d) => setItems(d.items)).catch(() => {});
  }, []);
  return (
    <div className="space-y-6" data-testid="admin-sources">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Source registry</div>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Every page we watch. And trust.</h1>
      </div>
      <div className="soft-card rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
              <th className="text-left px-4 py-3">Source</th>
              <th className="text-left px-4 py-3">URL</th>
              <th className="text-left px-4 py-3">Kind</th>
              <th className="text-left px-4 py-3">Trust</th>
              <th className="text-left px-4 py-3">Last run</th>
              <th className="text-left px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <div className="inline-flex items-center gap-2">
                    <Database className="h-4 w-4 text-clay-600" />
                    <span className="font-semibold">{s.org}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                  <a href={s.url} target="_blank" rel="noreferrer" className="link-under inline-flex items-center gap-1">{s.url} <ExternalLink className="h-3 w-3" /></a>
                </td>
                <td className="px-4 py-3 text-xs">{s.kind}</td>
                <td className="px-4 py-3 text-xs"><span className="pill pill-sage">{s.trust}</span></td>
                <td className="px-4 py-3 text-xs">{s.last_run}</td>
                <td className="px-4 py-3 text-xs"><span className={`pill ${s.status === "ok" ? "pill-sage" : "pill-amber"}`}>{s.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-muted-foreground">Phase-2 will add create/edit, fingerprint windows, and promotion rules.</div>
    </div>
  );
}
