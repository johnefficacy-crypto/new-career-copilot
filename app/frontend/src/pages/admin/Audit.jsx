import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Clock3, FileJson, Search, X } from "lucide-react";
import { api } from "../../lib/api";
import { useFocusTrap } from "../../shared/a11y/useFocusTrap";
import { EmptyState, ErrorState, LoadingSkeleton, StatusBadge } from "../../shared/ui";

function AuditDrawer({ event, onClose }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  useFocusTrap({ active: !!event, containerRef: panelRef, onEscape: onClose, initialFocusRef: closeRef });
  if (!event) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="absolute inset-0" onClick={onClose} />
      <aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="audit-detail-title" className="relative h-full w-full max-w-2xl overflow-auto border-l border-border bg-[#FBF6EF] p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Audit event</div>
            <h2 id="audit-detail-title" className="mt-1 font-heading text-2xl">{event.action || "Unknown action"}</h2>
          </div>
          <button ref={closeRef} type="button" className="btn btn-ghost h-9 w-9 p-0" onClick={onClose} aria-label="Close audit details"><X className="h-4 w-4" /></button>
        </div>
        <dl className="mt-5 grid gap-3 text-sm md:grid-cols-2">
          <Info label="When" value={event.created_at || event.at} />
          <Info label="Actor" value={event.actor_email || event.actor} />
          <Info label="Entity" value={`${event.entity_type || ""}:${event.entity_id || event.target || ""}`} />
          <Info label="Event ID" value={event.id} />
        </dl>
        <div className="mt-5 soft-card rounded-2xl p-4">
          <div className="flex items-center gap-2 font-semibold"><FileJson className="h-4 w-4" /> Payload</div>
          <pre className="mt-3 max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-white/70 p-3 text-[11px]">{JSON.stringify({ old_value: event.old_value, new_value: event.new_value, notes: event.notes }, null, 2)}</pre>
        </div>
      </aside>
    </div>
  );
}

export default function AdminAudit() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true); setErr("");
    try {
      const d = await api.get("/api/admin/audit");
      setItems(d.items || []);
    } catch (e) {
      setErr(e.message || "Failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((event) => `${event.actor_email || event.actor || ""} ${event.action || ""} ${event.entity_type || ""} ${event.entity_id || event.target || ""}`.toLowerCase().includes(needle));
  }, [items, query]);

  if (err?.includes("403")) {
    return (
      <div className="soft-card rounded-2xl p-5 text-sm" data-testid="admin-audit">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
          <div>
            <h1 className="font-heading text-xl">Audit access restricted</h1>
            <p className="mt-1 text-muted-foreground">You do not have <code>audit.view</code> permission.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="admin-audit">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Governance / audit</div>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Audit log.</h1>
        <p className="mt-1 text-sm text-muted-foreground">Review admin actions without expanding raw payloads inside the list.</p>
      </div>
      <div className="soft-card rounded-2xl p-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <span className="sr-only">Search audit log</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full rounded-xl border border-border bg-white/80 py-2 pl-9 pr-3 text-sm" placeholder="Search actor, action, entity" />
        </label>
      </div>
      {err && <ErrorState title="Failed to load audit log" message={err} onRetry={load} />}
      {loading ? <LoadingSkeleton variant="table" /> : null}
      {!loading && !err && filtered.length === 0 ? <EmptyState icon={Clock3} title="No audit events match this view" description="Adjust the search to inspect more events." /> : null}
      {!loading && !err && filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((event) => (
            <button key={event.id} type="button" onClick={() => setSelected(event)} className="soft-card block w-full rounded-2xl p-4 text-left transition hover:border-clay-300">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold">{event.action || "unknown.action"}</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">{event.actor_email || event.actor || "system"} / {event.entity_type || "entity"}:{event.entity_id || event.target || "-"}</div>
                </div>
                <StatusBadge status="pending" label={event.created_at || event.at || "Unknown time"} />
              </div>
            </button>
          ))}
        </div>
      ) : null}
      <AuditDrawer event={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function Info({ label, value }) {
  return <div className="rounded-xl border border-border bg-white/60 p-3"><dt className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</dt><dd className="mt-1 break-words">{value || "-"}</dd></div>;
}
