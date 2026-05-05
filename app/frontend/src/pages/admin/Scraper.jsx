import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function AdminScraper() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    api.get("/api/admin/scraper/runs").then((d) => setItems(d.items)).catch(() => {});
  }, []);
  return (
    <div className="space-y-6" data-testid="admin-scraper">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Scraper monitor · placeholder</div>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Runs, not rumors.</h1>
        <p className="text-muted-foreground mt-1">Phase-2 makes this streamable; for Phase-1 you see the last dry-run fingerprint only.</p>
      </div>
      <div className="soft-card rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
              <th className="text-left px-4 py-3">Run id</th>
              <th className="text-left px-4 py-3">Source</th>
              <th className="text-left px-4 py-3">When</th>
              <th className="text-left px-4 py-3">Mode</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Seen</th>
              <th className="text-left px-4 py-3">New</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-t border-border font-mono text-[12.5px]">
                <td className="px-4 py-3">{r.id}</td>
                <td className="px-4 py-3 text-clay-600">{r.source}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.at}</td>
                <td className="px-4 py-3">{r.mode}</td>
                <td className="px-4 py-3"><span className={`pill ${r.status === "ok" ? "pill-sage" : "pill-amber"}`}>{r.status}</span></td>
                <td className="px-4 py-3">{r.items_seen}</td>
                <td className="px-4 py-3">{r.items_new}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
