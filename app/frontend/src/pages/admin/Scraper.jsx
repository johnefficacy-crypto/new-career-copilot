import React, { useEffect, useState } from "react";
import { Play, RefreshCw } from "lucide-react";
import { api } from "../../lib/api";

export default function AdminScraper() {
  const [items, setItems] = useState([]);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState(null);

  async function load() {
    const d = await api.get("/api/admin/scrape/runs");
    setItems(d.items || []);
  }
  useEffect(() => {
    load().catch(() => {});
  }, []);

  async function runDry() {
    setRunning(true);
    setMsg(null);
    try {
      const r = await api.post("/api/admin/scrape/run-dry", {});
      setMsg(
        `Dry-run ${r.run_id?.slice(0, 8)}…  ·  ${r.status}  ·  found ${r.items_found}, new ${r.items_new}, dup ${r.items_duplicate}`
      );
      await load();
    } catch (e) {
      setMsg(`Dry-run failed: ${e.message}`);
    } finally {
      setRunning(false);
    }
  }

  const pillFor = (s) => {
    if (s === "completed" || s === "ok") return "pill-sage";
    if (s === "failed") return "pill-clay";
    return "pill-amber";
  };

  return (
    <div className="space-y-6" data-testid="admin-scraper">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
            Scraper monitor · canonical
          </div>
          <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">
            Runs, not rumors.
          </h1>
          <p className="text-muted-foreground mt-1">
            Each pass writes to <code>scrape_runs</code> + <code>scrape_queue</code>.
            Items always land <code>pending</code>; admins promote/reject from{" "}
            <a href="/admin/eligibility-queue" className="link-under">
              the queue
            </a>
            .
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="btn btn-ghost"
            data-testid="scraper-reload"
          >
            <RefreshCw className="h-4 w-4" /> Reload
          </button>
          <button
            disabled={running}
            onClick={runDry}
            className="btn btn-primary"
            data-testid="scraper-run-dry"
          >
            <Play className={`h-4 w-4 ${running ? "animate-spin" : ""}`} />
            {running ? "Running…" : "Run dry-scrape"}
          </button>
        </div>
      </div>

      {msg && (
        <div
          data-testid="scraper-msg"
          className="rounded-xl bg-sage-100/60 border border-sage-200 p-3 text-xs"
        >
          {msg}
        </div>
      )}

      <div className="soft-card rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
              <th className="text-left px-4 py-3">Run id</th>
              <th className="text-left px-4 py-3">Trigger</th>
              <th className="text-left px-4 py-3">When</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Sources</th>
              <th className="text-left px-4 py-3">Seen</th>
              <th className="text-left px-4 py-3">New</th>
              <th className="text-left px-4 py-3">Dup</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  No scrape runs yet. Click "Run dry-scrape" to populate.
                </td>
              </tr>
            )}
            {items.map((r) => (
              <tr
                key={r.id}
                className="border-t border-border font-mono text-[12.5px]"
                data-testid={`run-${r.id}`}
              >
                <td className="px-4 py-3">{r.id?.slice(0, 8)}…</td>
                <td className="px-4 py-3 text-clay-600">{r.source}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {r.at ? new Date(r.at).toLocaleString("en-IN") : "—"}
                </td>
                <td className="px-4 py-3">
                  <span className={`pill ${pillFor(r.status)}`}>{r.status}</span>
                </td>
                <td className="px-4 py-3">{r.sources_checked}</td>
                <td className="px-4 py-3">{r.items_seen}</td>
                <td className="px-4 py-3">{r.items_new}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {r.items_duplicate}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
