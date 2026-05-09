import React, { useEffect, useMemo, useState } from "react";
import SourceHealthBadge from "../../features/admin/sources/SourceHealthBadge";
import { api } from "../../lib/api";
import { AdminTable, EmptyState, ErrorState, InputField, LoadingSkeleton, RowActions, StatusBadge } from "../../shared/ui";

export default function AdminSources() {
  const [items, setItems] = useState([]);
  const [resultById, setResultById] = useState({});
  const [openDetails, setOpenDetails] = useState({});
  const [form, setForm] = useState({ source_name: "", official_url: "" });
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true); setError(null);
    try { const d = await api.get("/api/admin/sources"); setItems(d.items || []); } catch (e) { setError(e); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const verify = async (id) => { const r = await api.post(`/api/admin/sources/${id}/verify`, {}); setResultById((x) => ({ ...x, [id]: r })); await load(); };
  const create = async () => { try { await api.post("/api/admin/sources", form); setMsg("source created"); setForm({ source_name: "", official_url: "" }); await load(); } catch (e) { setMsg(e.message); } };
  const toggle = async (id, on) => { if (!window.confirm(`${on ? "Deactivate" : "Activate"} this source?`)) return; await api.post(`/api/admin/sources/${id}/${on ? "deactivate" : "activate"}`, {}); await load(); };
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
    { key: "details", header: "Details", render: (s) => <div><button className="text-xs link-under" onClick={() => setOpenDetails((o) => ({ ...o, [s.id]: !o[s.id] }))}>{openDetails[s.id] ? "Hide details" : "Show details"}</button>{openDetails[s.id] && <div className="mt-2 text-xs space-y-1 text-muted-foreground"><div>notification_url: {s.notification_url || "—"}</div><div>last_error: {s.last_error || "—"}</div><div>notes: {s.notes || "—"}</div>{resultById[s.id] && <div className="p-2 rounded border border-border bg-white/60 text-foreground">verify checks={JSON.stringify(resultById[s.id].checks || [])} warnings={JSON.stringify(resultById[s.id].warnings || [])} errors={JSON.stringify(resultById[s.id].errors || [])}</div>}</div>}</div> },
  ];

  return <div className="space-y-4" data-testid="admin-sources"><h1 className="font-heading text-2xl">Sources trust</h1><div className="grid grid-cols-2 gap-3 text-xs"><div className="soft-card p-3">Sources needing review: <b>{summary.needsReview}</b></div><div className="soft-card p-3">Recently failed sources: <b>{summary.failed}</b></div></div>{msg && <div className="soft-card p-2 text-xs">{msg}</div>}<div className="soft-card p-3 grid md:grid-cols-3 gap-3 items-end"><InputField label="Source name" value={form.source_name} onChange={(e) => setForm({ ...form, source_name: e.target.value })} /><InputField label="Official URL" value={form.official_url} onChange={(e) => setForm({ ...form, official_url: e.target.value })} /><button className="btn btn-primary" onClick={create}>Create Source</button></div>{loading ? <LoadingSkeleton variant="table" /> : null}{!loading && error ? <ErrorState title="Failed to load sources" message={error.message} onRetry={load} /> : null}{!loading && !error && items.length === 0 ? <EmptyState title="No sources found" description="Create a source to begin trust verification." /> : null}{!loading && !error && items.length > 0 ? <AdminTable columns={columns} rows={items} getRowKey={(s) => s.id} renderRowActions={(s) => <RowActions actions={[{ label: "Verify", ariaLabel: `Verify source ${s.org || s.source_name}`, onClick: () => verify(s.id) }, { label: s.is_active ? "Deactivate" : "Activate", ariaLabel: `${s.is_active ? "Deactivate" : "Activate"} source ${s.org || s.source_name}`, onClick: () => toggle(s.id, !!s.is_active) }]} />} /> : null}</div>;
}
