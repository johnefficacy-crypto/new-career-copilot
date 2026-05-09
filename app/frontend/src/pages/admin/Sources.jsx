import React, { useEffect, useMemo, useRef, useState } from "react";
import SourceHealthBadge from "../../features/admin/sources/SourceHealthBadge";
import { api } from "../../lib/api";
import { useFocusTrap } from "../../shared/a11y/useFocusTrap";
import { AdminTable, EmptyState, ErrorState, InputField, LoadingSkeleton, RowActions, StatusBadge } from "../../shared/ui";
import useAdminAction from "../../features/admin/shared/useAdminAction";

function SourceDetailsDialog({ source, result, onClose }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  useFocusTrap({ active: !!source, containerRef: panelRef, onEscape: onClose, initialFocusRef: closeRef });
  if (!source) return null;

  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><div className="absolute inset-0 bg-black/30" onClick={onClose} /><aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="source-details-title" className="relative w-full max-w-lg rounded-xl border border-border bg-[#FBF6EF] p-4 space-y-2"><div className="flex items-start justify-between gap-3"><h2 id="source-details-title" className="font-heading text-lg">{source.org || source.source_name} details</h2><button ref={closeRef} className="btn btn-ghost text-xs" onClick={onClose}>Close</button></div><div className="text-xs space-y-1 text-muted-foreground"><div>notification_url: {source.notification_url || "—"}</div><div>last_error: {source.last_error || "—"}</div><div>notes: {source.notes || "—"}</div>{result && <div className="p-2 rounded border border-border bg-white/60 text-foreground">verify checks={JSON.stringify(result.checks || [])} warnings={JSON.stringify(result.warnings || [])} errors={JSON.stringify(result.errors || [])}</div>}</div></aside></div>;
}

export default function AdminSources() {
  const [items, setItems] = useState([]);
  const [resultById, setResultById] = useState({});
  const [selectedDetails, setSelectedDetails] = useState(null);
  const [form, setForm] = useState({ source_name: "", official_url: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { runAction, busyKey, error: actionError } = useAdminAction();

  const load = async () => {
    setLoading(true); setError(null);
    try { const d = await api.get("/api/admin/sources"); setItems(d.items || []); } catch (e) { setError(e); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const verify = async (id) => runAction({ key: `verify-${id}`, successMessage: "Source verified", action: async () => { const r = await api.post(`/api/admin/sources/${id}/verify`, {}); setResultById((x) => ({ ...x, [id]: r })); await load(); } });
  const create = async () => runAction({ key: "create", successMessage: "Source created", action: async () => { await api.post("/api/admin/sources", form); setForm({ source_name: "", official_url: "" }); await load(); } });
  const toggle = async (id, on) => runAction({ key: `${on ? "deactivate" : "activate"}-${id}`, confirm: `${on ? "Deactivate" : "Activate"} this source?`, successMessage: `Source ${on ? "deactivated" : "activated"}`, action: async () => { await api.post(`/api/admin/sources/${id}/${on ? "deactivate" : "activate"}`, {}); await load(); } });
  const summary = useMemo(() => ({ needsReview: items.filter((i) => i.verification_status === "needs_review").length, failed: items.filter((i) => (i.consecutive_fails || 0) > 0 || i.last_error).length }), [items]);

  const columns = [
    { key: "source", header: "Source", render: (s) => <div><div className="font-medium">{s.org || s.source_name}</div><div className="text-xs text-muted-foreground">{s.official_url || s.url || "—"}</div></div> },
    { key: "type", header: "Type", render: (s) => s.kind || "—" },
    { key: "trust", header: "Trust", render: (s) => s.trust_score ?? "—" },
    { key: "health", header: "Health", render: (s) => <SourceHealthBadge source={s} /> },
    { key: "anti_bot", header: "Anti-bot risk", render: (s) => s.anti_bot_risk || "—" },
    { key: "last_success", header: "Last success", render: (s) => s.last_success_at || "—" },
    { key: "fails", header: "Fails", render: (s) => s.consecutive_fails || 0 },
    { key: "active", header: "Active", render: (s) => <StatusBadge status={s.is_active ? "active" : "disabled"} label={s.is_active ? "Active" : "Inactive"} /> },
    { key: "details", header: "Details", render: (s) => <button className="text-xs link-under" onClick={() => setSelectedDetails(s.id)}>Show details</button> },
  ];

  return <div className="space-y-4" data-testid="admin-sources"><h1 className="font-heading text-2xl">Sources trust</h1><div className="grid grid-cols-2 gap-3 text-xs"><div className="soft-card p-3">Sources needing review: <b>{summary.needsReview}</b></div><div className="soft-card p-3">Recently failed sources: <b>{summary.failed}</b></div></div>{actionError && <div className="soft-card p-2 text-xs">{actionError.message}</div>}<div className="soft-card p-3 grid md:grid-cols-3 gap-3 items-end"><InputField label="Source name" value={form.source_name} onChange={(e) => setForm({ ...form, source_name: e.target.value })} /><InputField label="Official URL" value={form.official_url} onChange={(e) => setForm({ ...form, official_url: e.target.value })} /><button className="btn btn-primary" disabled={busyKey === "create"} onClick={create}>{busyKey === "create" ? "Creating…" : "Create Source"}</button></div>{loading ? <LoadingSkeleton variant="table" /> : null}{!loading && error ? <ErrorState title="Failed to load sources" message={error.message} onRetry={load} /> : null}{!loading && !error && items.length === 0 ? <EmptyState title="No sources found" description="Create a source to begin trust verification." /> : null}{!loading && !error && items.length > 0 ? <AdminTable columns={columns} rows={items} getRowKey={(s) => s.id} renderRowActions={(s) => <RowActions groupLabel={`Row actions for ${s.org || s.source_name || "source"}`} actions={[{ label: "Verify", ariaLabel: `Verify source ${s.org || s.source_name}`, onClick: () => verify(s.id), disabled: busyKey === `verify-${s.id}` }, { label: s.is_active ? "Deactivate" : "Activate", ariaLabel: `${s.is_active ? "Deactivate" : "Activate"} source ${s.org || s.source_name}`, onClick: () => toggle(s.id, !!s.is_active), disabled: busyKey === `${s.is_active ? "deactivate" : "activate"}-${s.id}` }]} />} /> : null}<SourceDetailsDialog source={items.find((s) => s.id === selectedDetails)} result={resultById[selectedDetails]} onClose={() => setSelectedDetails(null)} /></div>;
}
