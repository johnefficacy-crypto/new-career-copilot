import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function AdminRecruitments() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    api.get("/api/recruitments").then((d) => setItems(d.items)).catch(() => {});
  }, []);
  return (
    <div className="space-y-6" data-testid="admin-recruitments">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Recruitments</div>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Canonical recruitments · Phase-1 read</h1>
        <p className="text-muted-foreground mt-1">Phase-2 adds create/edit + scraper promotion.</p>
      </div>
      <div className="soft-card rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
              <th className="text-left px-4 py-3">Recruitment</th>
              <th className="text-left px-4 py-3">Org</th>
              <th className="text-left px-4 py-3">Stage</th>
              <th className="text-left px-4 py-3">Posts</th>
              <th className="text-left px-4 py-3">Vacancies</th>
              <th className="text-left px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.slug} className="border-t border-border">
                <td className="px-4 py-3 font-semibold">{r.name}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{r.organization}</td>
                <td className="px-4 py-3 text-xs">{r.stage}</td>
                <td className="px-4 py-3 text-xs">{r.posts_matched} / {r.posts_total}</td>
                <td className="px-4 py-3 text-xs">{r.vacancies?.toLocaleString()}</td>
                <td className="px-4 py-3"><span className={`pill ${r.status === "eligible" ? "pill-sage" : r.status === "urgent" ? "pill-clay" : "pill-amber"}`}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
