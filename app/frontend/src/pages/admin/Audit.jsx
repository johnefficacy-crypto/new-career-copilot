import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function AdminAudit() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    api.get("/api/admin/audit").then((d) => setItems(d.items || [])).catch(() => {});
  }, []);
  return (
    <div className="space-y-6" data-testid="admin-audit">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Audit log</div>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Every write, logged.</h1>
      </div>
      <div className="soft-card rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
              <th className="text-left px-4 py-3">Timestamp</th>
              <th className="text-left px-4 py-3">Actor</th>
              <th className="text-left px-4 py-3">Action</th>
              <th className="text-left px-4 py-3">Meta</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No events logged yet.</td></tr>
            ) : items.map((a) => (
              <tr key={a.id} className="border-t border-border font-mono text-[12.5px]">
                <td className="px-4 py-2 text-muted-foreground">{(a.created_at || "").slice(0, 19).replace("T", " ")}</td>
                <td className="px-4 py-2">{a.actor_email}</td>
                <td className="px-4 py-2 text-clay-600">{a.action}</td>
                <td className="px-4 py-2 text-muted-foreground">{JSON.stringify(a.meta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
