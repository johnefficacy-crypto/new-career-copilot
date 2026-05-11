import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, History, Pencil, Plus, ShieldCheck, X } from "lucide-react";
import SourceHealthBadge from "../../features/admin/sources/SourceHealthBadge";
import { api } from "../../lib/api";
import { useFocusTrap } from "../../shared/a11y/useFocusTrap";
import { AdminTable, EmptyState, ErrorState, LoadingSkeleton, RowActions, StatusBadge } from "../../shared/ui";
import useAdminAction from "../../features/admin/shared/useAdminAction";
import AuditTimelineDrawer from "../../features/admin/shared/AuditTimelineDrawer";
import { adminTrustService } from "../../services/adminTrustService";

const SOURCE_TYPES = [
  { value: "aggregator", label: "Aggregator/listing page" },
  { value: "official_html", label: "Official HTML page" },
  { value: "official_pdf", label: "Official PDF" },
  { value: "rss", label: "RSS feed" },
  { value: "sitemap", label: "Sitemap" },
  { value: "api", label: "API source" },
];

const EMPTY_FORM = {
  source_name: "",
  official_url: "",
  source_type: "",
  is_active: true,
  is_verified: false,
  tier: "",
  category: "",
  max_items_per_run: 25,
  rate_limit_seconds: 5,
  timeout_seconds: 15,
  include_patterns: "",
  exclude_patterns: "",
  allowed_domains: "",
  notes: "",
};

function splitLines(value) {
  return String(value || "").split(/\n|,/).map((x) => x.trim()).filter(Boolean);
}

function sourceToForm(source) {
  const scrape = source?.scrape_config || {};
  const adapter = source?.adapter_config || {};
  return {
    ...EMPTY_FORM,
    source_name: source?.org || source?.source_name || "",
    official_url: source?.official_url || source?.source_url || source?.url || "",
    source_type: source?.source_type || source?.kind || "",
    is_active: source?.is_active !== false,
    is_verified: !!source?.is_verified,
    tier: source?.tier || "",
    category: source?.category || "",
    max_items_per_run: scrape.max_items_per_run || 25,
    rate_limit_seconds: scrape.rate_limit_seconds || 5,
    timeout_seconds: scrape.timeout_seconds || 15,
    include_patterns: (adapter.include_patterns || []).join("\n"),
    exclude_patterns: (adapter.exclude_patterns || []).join("\n"),
    allowed_domains: (adapter.allowed_domains || []).join("\n"),
    notes: source?.notes || "",
  };
}

function buildPayload(form) {
  if (!form.source_type) throw new Error("Select a source type before saving.");
  const isAggregator = form.source_type === "aggregator";
  return {
    source_name: form.source_name.trim(),
    official_url: form.official_url.trim(),
    source_url: form.official_url.trim(),
    source_type: form.source_type,
    is_active: !!form.is_active,
    is_verified: isAggregator ? false : !!form.is_verified,
    tier: form.tier === "" ? null : Number(form.tier),
    category: form.category || (isAggregator ? "aggregator" : null),
    notes: form.notes,
    discovery_only: isAggregator,
    is_official_source: !isAggregator && !!form.is_verified,
    can_publish_directly: false,
    requires_official_confirmation: isAggregator,
    scrape_config: {
      max_items_per_run: Number(form.max_items_per_run) || 25,
      rate_limit_seconds: Number(form.rate_limit_seconds) || 0,
      timeout_seconds: Number(form.timeout_seconds) || 15,
    },
    trust_config: {
      manual_review_required: true,
      requires_official_source: isAggregator,
      evidence_required: true,
      auto_promote: false,
      discovery_only: isAggregator,
    },
    adapter_config: {
      include_patterns: splitLines(form.include_patterns),
      exclude_patterns: splitLines(form.exclude_patterns),
      allowed_domains: splitLines(form.allowed_domains),
    },
  };
}

function SourceFormDrawer({ open, mode, form, setForm, busy, error, onClose, onSubmit }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  useFocusTrap({ active: open, containerRef: panelRef, onEscape: onClose, initialFocusRef: closeRef });
  if (!open) return null;

  const isAggregator = form.source_type === "aggregator";
  const updateType = (source_type) => {
    setForm((current) => ({
      ...current,
      source_type,
      is_verified: source_type === "aggregator" ? false : current.is_verified,
      category: source_type === "aggregator" ? "aggregator" : current.category,
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="absolute inset-0" onClick={onClose} />
      <aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="source-form-title" className="relative h-full w-full max-w-2xl overflow-auto border-l border-border bg-[#FBF6EF] p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Source registry</div>
            <h2 id="source-form-title" className="font-heading text-2xl">{mode === "edit" ? "Edit source" : "Add source"}</h2>
          </div>
          <button ref={closeRef} type="button" className="btn btn-ghost h-9 w-9 p-0" onClick={onClose} aria-label="Close source form"><X className="h-4 w-4" /></button>
        </div>

        {isAggregator && (
          <div className="mt-4 flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>Aggregator sources are discovery-only. They cannot satisfy official source provenance by themselves.</div>
          </div>
        )}

        {error && <div className="mt-4 rounded-xl border border-destructive/30 bg-white/70 p-3 text-sm text-destructive">{error}</div>}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Source name"><input className="input" value={form.source_name} onChange={(e) => setForm({ ...form, source_name: e.target.value })} /></Field>
          <Field label="Source URL / Official URL"><input className="input" value={form.official_url} onChange={(e) => setForm({ ...form, official_url: e.target.value })} /></Field>
          <Field label="Source type">
            <select className="input" value={form.source_type} onChange={(e) => updateType(e.target.value)} required>
              <option value="">Select source type</option>
              {SOURCE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </Field>
          <Field label="Trust tier / source role"><input className="input" type="number" value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })} /></Field>
          <Field label="Max items per run"><input className="input" type="number" min="1" max="100" value={form.max_items_per_run} onChange={(e) => setForm({ ...form, max_items_per_run: e.target.value })} /></Field>
          <Field label="Rate limit seconds"><input className="input" type="number" min="0" value={form.rate_limit_seconds} onChange={(e) => setForm({ ...form, rate_limit_seconds: e.target.value })} /></Field>
          <Field label="Timeout seconds"><input className="input" type="number" min="1" value={form.timeout_seconds} onChange={(e) => setForm({ ...form, timeout_seconds: e.target.value })} /></Field>
          <Field label="Source role"><input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
          <Field label="Link include patterns"><textarea className="input min-h-[90px]" value={form.include_patterns} onChange={(e) => setForm({ ...form, include_patterns: e.target.value })} /></Field>
          <Field label="Link exclude patterns"><textarea className="input min-h-[90px]" value={form.exclude_patterns} onChange={(e) => setForm({ ...form, exclude_patterns: e.target.value })} /></Field>
          <Field label="Allowed domains"><textarea className="input min-h-[90px]" value={form.allowed_domains} onChange={(e) => setForm({ ...form, allowed_domains: e.target.value })} /></Field>
          <Field label="Notes"><textarea className="input min-h-[90px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="soft-card flex items-center justify-between rounded-xl p-3 text-sm">
            <span>Active</span>
            <input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
          </label>
          <label className={`soft-card flex items-center justify-between rounded-xl p-3 text-sm ${isAggregator ? "opacity-60" : ""}`}>
            <span>Verified</span>
            <input type="checkbox" disabled={isAggregator} checked={!isAggregator && !!form.is_verified} onChange={(e) => setForm({ ...form, is_verified: e.target.checked })} />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={onSubmit}>{busy ? "Saving..." : "Save source"}</button>
        </div>
        <style>{`.input { width:100%; padding: 0.55rem 0.85rem; border-radius: 0.75rem; background: rgba(255,255,255,0.85); border: 1px solid hsl(var(--border)); font-size: 14px; }`}</style>
      </aside>
    </div>
  );
}

function SourceDetailsDialog({ source, result, onEdit, onClose }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  useFocusTrap({ active: !!source, containerRef: panelRef, onEscape: onClose, initialFocusRef: closeRef });
  if (!source) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="absolute inset-0" onClick={onClose} />
      <aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="source-details-title" className="relative h-full w-full max-w-xl overflow-auto border-l border-border bg-[#FBF6EF] p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id="source-details-title" className="font-heading text-2xl">{source.org || source.source_name} details</h2>
          <button ref={closeRef} className="btn btn-ghost h-9 w-9 p-0" onClick={onClose} aria-label="Close details"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-4 space-y-3 text-sm">
          <Detail label="Type" value={source.source_type || source.kind} />
          <Detail label="Official URL" value={source.official_url} />
          <Detail label="Notification URL" value={source.notification_url} />
          <Detail label="Last error" value={source.last_error} />
          <Detail label="Notes" value={source.notes} />
          {result && <pre className="max-h-56 overflow-auto rounded-xl border border-border bg-white/70 p-3 text-xs">{JSON.stringify(result, null, 2)}</pre>}
        </div>
        <div className="mt-5 flex justify-end">
          <button className="btn btn-primary" onClick={() => onEdit(source)}><Pencil className="h-4 w-4" /> Edit source</button>
        </div>
      </aside>
    </div>
  );
}

export default function AdminSources() {
  const [items, setItems] = useState([]);
  const [resultById, setResultById] = useState({});
  const [selectedDetails, setSelectedDetails] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(true);
  const [auditTarget, setAuditTarget] = useState(null);
  const [auditItems, setAuditItems] = useState([]);
  const [error, setError] = useState(null);
  const { runAction, busyKey, error: actionError } = useAdminAction();

  const load = async () => {
    setLoading(true); setError(null);
    try { const d = await api.get("/api/admin/sources"); setItems(d.items || []); } catch (e) { setError(e); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setFormError(""); setFormOpen(true); };
  const openEdit = (source) => { setEditing(source); setForm(sourceToForm(source)); setFormError(""); setFormOpen(true); setSelectedDetails(null); };
  const closeForm = () => { setFormOpen(false); setEditing(null); setFormError(""); };

  const save = async () => {
    setFormError("");
    let payload;
    try {
      payload = buildPayload(form);
    } catch (e) {
      setFormError(e.message);
      return;
    }
    const key = editing ? `update-${editing.id}` : "create";
    await runAction({
      key,
      successMessage: editing ? "Source updated" : "Source created",
      action: async () => {
        if (editing) await api.put(`/api/admin/sources/${editing.id}`, payload);
        else await api.post("/api/admin/sources", payload);
        closeForm();
        await load();
      },
    });
  };

  const verify = async (source) => runAction({ key: `verify-${source.id}`, successMessage: "Source verified", action: async () => { const r = await api.post(`/api/admin/sources/${source.id}/verify`, {}); setResultById((x) => ({ ...x, [source.id]: r })); await load(); } });
  const toggle = async (id, on) => runAction({ key: `${on ? "deactivate" : "activate"}-${id}`, confirm: `${on ? "Deactivate" : "Activate"} this source?`, successMessage: `Source ${on ? "deactivated" : "activated"}`, action: async () => { await api.post(`/api/admin/sources/${id}/${on ? "deactivate" : "activate"}`, {}); await load(); } });
  const summary = useMemo(() => ({ needsReview: items.filter((i) => i.verification_status === "needs_review").length, failed: items.filter((i) => (i.consecutive_fails || 0) > 0 || i.last_error).length, aggregators: items.filter((i) => i.source_type === "aggregator").length }), [items]);
  const showHistory = async (s) => { const d = await adminTrustService.sourceAudit(s.id); setAuditItems(d.items || []); setAuditTarget(s); };

  const columns = [
    { key: "source", header: "Source", render: (s) => <div className="max-w-[260px]"><div className="truncate font-medium">{s.org || s.source_name}</div><div className="truncate text-xs text-muted-foreground">{s.official_url || s.url || "-"}</div></div> },
    { key: "type", header: "Type", render: (s) => <StatusBadge status={s.source_type || s.kind || "unknown"} label={sourceTypeLabel(s.source_type || s.kind)} /> },
    { key: "policy", header: "Policy", render: (s) => s.source_type === "aggregator" ? <span className="pill pill-amber">Discovery only</span> : <span className="pill pill-sage">Official candidate</span> },
    { key: "health", header: "Health", render: (s) => <SourceHealthBadge source={s} /> },
    { key: "last_success", header: "Last success", render: (s) => s.last_success_at || "-" },
    { key: "active", header: "Active", render: (s) => <StatusBadge status={s.is_active ? "active" : "disabled"} label={s.is_active ? "Active" : "Inactive"} /> },
    { key: "details", header: "Details", render: (s) => <button className="text-xs link-under" onClick={() => setSelectedDetails(s.id)}>Show details</button> },
  ];

  return (
    <div className="space-y-4" data-testid="admin-sources">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl">Sources trust</h1>
          <p className="text-sm text-muted-foreground">Aggregator sources discover candidates only; official provenance is still required before publishing.</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}><Plus className="h-4 w-4" /> Add source</button>
      </div>
      <div className="grid gap-3 text-xs md:grid-cols-3">
        <div className="soft-card rounded-xl p-3">Sources needing review: <b>{summary.needsReview}</b></div>
        <div className="soft-card rounded-xl p-3">Recently failed sources: <b>{summary.failed}</b></div>
        <div className="soft-card rounded-xl p-3">Discovery aggregators: <b>{summary.aggregators}</b></div>
      </div>
      {actionError && <div className="soft-card rounded-xl p-3 text-xs text-destructive">{actionError.message}</div>}
      {loading ? <LoadingSkeleton variant="table" /> : null}
      {!loading && error ? <ErrorState title="Failed to load sources" message={error.message} onRetry={load} /> : null}
      {!loading && !error && items.length === 0 ? <EmptyState icon={ShieldCheck} title="No sources found" description="Create a source to begin trust verification." actionLabel="Add source" onAction={openCreate} /> : null}
      {!loading && !error && items.length > 0 ? <AdminTable columns={columns} rows={items} getRowKey={(s) => s.id} renderRowActions={(s) => <RowActions groupLabel={`Row actions for ${s.org || s.source_name || "source"}`} actions={[{ label: "Edit", icon: Pencil, ariaLabel: `Edit source ${s.org || s.source_name}`, onClick: () => openEdit(s) }, { label: "Verify", icon: ShieldCheck, ariaLabel: `Verify source ${s.org || s.source_name}`, onClick: () => verify(s), disabled: s.source_type === "aggregator" || busyKey === `verify-${s.id}` }, { label: s.is_active ? "Deactivate" : "Activate", ariaLabel: `${s.is_active ? "Deactivate" : "Activate"} source ${s.org || s.source_name}`, onClick: () => toggle(s.id, !!s.is_active), disabled: busyKey === `${s.is_active ? "deactivate" : "activate"}-${s.id}` }, { label: "History", icon: History, ariaLabel: `View history for source ${s.org || s.source_name}`, onClick: () => showHistory(s) }]} />} /> : null}
      <SourceFormDrawer open={formOpen} mode={editing ? "edit" : "create"} form={form} setForm={setForm} busy={busyKey === "create" || busyKey === `update-${editing?.id}`} error={formError} onClose={closeForm} onSubmit={save} />
      <SourceDetailsDialog source={items.find((s) => s.id === selectedDetails)} result={resultById[selectedDetails]} onEdit={openEdit} onClose={() => setSelectedDetails(null)} />
      <AuditTimelineDrawer open={!!auditTarget} title={auditTarget?.org || auditTarget?.source_name || "Source"} items={auditItems} onClose={() => setAuditTarget(null)} />
    </div>
  );
}

function Field({ label, children }) {
  return <label className="block text-sm"><div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>{children}</label>;
}

function Detail({ label, value }) {
  return <div><div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div><div className="break-words">{value || "-"}</div></div>;
}

function sourceTypeLabel(value) {
  return SOURCE_TYPES.find((type) => type.value === value)?.label || value || "Unknown";
}
