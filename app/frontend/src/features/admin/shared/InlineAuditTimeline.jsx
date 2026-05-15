import React, { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { api } from "../../../lib/api";

// Lightweight inline audit timeline. Open the disclosure to fetch the
// last N admin_audit_logs rows scoped to (entity_type, entity_id) via
// GET /api/admin/audit. Intended to be embedded in any drawer that
// shows an entity (recruitment, scrape queue item, recompute row) so
// the reviewer can see "who did what when" without leaving context.

function formatActionLabel(action) {
  if (!action) return "action";
  return action.replace(/_/g, " ").replace(/\./g, " · ");
}

function actorLabel(row) {
  return row.actor_email || (row.actor_id ? `actor ${String(row.actor_id).slice(0, 8)}` : "system");
}

function valueSnippet(value) {
  if (value == null) return null;
  if (typeof value === "string") return value.length > 200 ? `${value.slice(0, 200)}…` : value;
  try {
    const j = JSON.stringify(value);
    return j.length > 240 ? `${j.slice(0, 240)}…` : j;
  } catch {
    return String(value);
  }
}

export default function InlineAuditTimeline({ entityType, entityId, title = "Audit timeline", defaultOpen = false, limit = 25 }) {
  const [open, setOpen] = useState(defaultOpen);
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!entityType) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("entity_type", entityType);
      if (entityId) params.set("entity_id", entityId);
      params.set("limit", String(limit));
      const r = await api.get(`/api/admin/audit?${params.toString()}`);
      setItems(r.items || []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, limit]);

  // Lazy-fetch only when the disclosure opens. Re-opening reuses the
  // cached list; the user can press Refresh to force a re-fetch.
  useEffect(() => {
    if (open && items === null) load();
  }, [open, items, load]);

  return (
    <section className="soft-card rounded-2xl p-3" data-testid="inline-audit-timeline">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
          <span className="font-semibold text-sm">{title}</span>
          {items != null ? <span className="text-[11px] text-muted-foreground">({items.length})</span> : null}
        </div>
        {open ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); load(); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); load(); } }}
            className="btn btn-ghost h-7 text-[11px]"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Refresh
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="mt-3 space-y-2">
          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-white/70 p-2 text-xs text-destructive">
              Failed to load audit log: {error.message}
            </div>
          ) : null}

          {loading && !items ? <div className="text-xs text-muted-foreground">Loading…</div> : null}

          {items && items.length === 0 ? (
            <div className="rounded-lg border border-border bg-white/70 p-2 text-xs text-muted-foreground">
              No audit entries recorded yet.
            </div>
          ) : null}

          {(items || []).map((row) => (
            <div key={row.id} className="rounded-lg border border-border bg-white/70 p-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold">{formatActionLabel(row.action)}</div>
                <div className="text-[10px] text-muted-foreground">
                  {row.created_at ? new Date(row.created_at).toLocaleString("en-IN") : ""}
                </div>
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                by <b>{actorLabel(row)}</b>
                {row.notes ? <span className="ml-2">· {row.notes}</span> : null}
              </div>
              {row.new_value != null ? (
                <details className="mt-1">
                  <summary className="cursor-pointer text-[11px] text-muted-foreground">payload</summary>
                  <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-white/80 p-1 text-[10px]">
                    {valueSnippet(row.new_value)}
                  </pre>
                </details>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
