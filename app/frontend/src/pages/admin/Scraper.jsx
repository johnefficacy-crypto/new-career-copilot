import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Eye, Filter, Play, RefreshCw, Search, X } from "lucide-react";
import { api, getApiUnverifiedFields } from "../../lib/api";
import AdminWorkflowStepper from "../../features/admin/workflow/AdminWorkflowStepper";
import NextActionCallout from "../../features/admin/workflow/NextActionCallout";
import FieldReviewGroup from "../../features/admin/workflow/FieldReviewGroup";
import { HIGH_RISK_QUEUE_FIELDS, NEXT_ACTION_MESSAGES, QUEUE_ACTION_LABELS, RECOMMENDED_REVIEW_FIELDS, SOURCE_TYPE_LABELS } from "../../features/admin/workflow/adminWorkflowContract";
import { useFocusTrap } from "../../shared/a11y/useFocusTrap";
import { EmptyState, ErrorState, LoadingSkeleton, StatusBadge, useToast } from "../../shared/ui";

function shortId(value) {
  return value ? String(value).slice(0, 8) : "-";
}

function typeLabel(value) {
  return SOURCE_TYPE_LABELS[value] || value || "Unknown";
}

function selectedSourceIds(mode, selected) {
  return mode === "selected" ? selected : null;
}

function QueueDetailDrawer({ item, onClose, onAction, onFieldAction }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  useFocusTrap({ active: !!item, containerRef: panelRef, onEscape: onClose, initialFocusRef: closeRef });
  if (!item) return null;
  const extracted = item.extracted_data || {};
  const evidence = item.field_evidence_status || item.field_evidence || {};

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="absolute inset-0" onClick={onClose} />
      <aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="queue-detail-title" className="relative h-full w-full max-w-3xl overflow-auto border-l border-border bg-[#FBF6EF] p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Scrape queue item</div>
            <h2 id="queue-detail-title" className="truncate font-heading text-2xl">{extracted.title || extracted.name || item.source_name || "Candidate"}</h2>
          </div>
          <button ref={closeRef} className="btn btn-ghost h-9 w-9 p-0" onClick={onClose} aria-label="Close queue details"><X className="h-4 w-4" /></button>
        </div>

        <section className="mt-5 grid gap-3 md:grid-cols-2">
          <Info label="Source" value={item.source_name} />
          <Info label="Source type" value={typeLabel(item.source_type)} />
          <Info label="Organization" value={extracted.organization_name || extracted.organization} />
          <Info label="Dates" value={`${extracted.apply_start_date || "-"} to ${extracted.apply_end_date || "-"}`} />
          <Info label="Duplicate" value={item.duplicate_of || "No canonical duplicate linked"} />
          <Info label="Official provenance" value={item.official_source_resolved ? "Resolved" : "Required / unresolved"} />
        </section>

        <section className="mt-5 soft-card rounded-2xl p-4">
          <h3 className="font-semibold">Admin review actions</h3>
          <p className="mt-1 text-sm text-muted-foreground">Promotion creates a canonical recruitment draft with publish_status=needs_review. It does not publish and does not send alerts.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-ghost" onClick={() => onAction(item.id, "approve")}>{QUEUE_ACTION_LABELS.approve}</button>
            <button className="btn btn-ghost" onClick={() => onAction(item.id, "reject")}>{QUEUE_ACTION_LABELS.reject}</button>
            <button className="btn btn-primary" disabled={!item.promotable} title={item.unverified_fields?.length ? `Verify: ${item.unverified_fields.join(", ")}` : ""} onClick={() => onAction(item.id, "promote")}>{QUEUE_ACTION_LABELS.promote}</button>
          </div>
          {item.unverified_fields?.length ? <div className="mt-2 text-xs text-amber-700">Backend blockers: {item.unverified_fields.join(", ")}</div> : null}
        </section>

        <section className="mt-5 soft-card rounded-2xl p-4">
          <h3 className="font-semibold">Field evidence</h3>
          <div className="mt-3">
            <FieldReviewGroup
              extracted={extracted}
              evidence={evidence}
              requiredFields={HIGH_RISK_QUEUE_FIELDS}
              recommendedFields={RECOMMENDED_REVIEW_FIELDS}
              onFieldAction={(field, action, correctedValue) => onFieldAction(item.id, field, action, correctedValue)}
            />
          </div>
        </section>

        <section className="mt-5 soft-card rounded-2xl p-4">
          <h3 className="font-semibold">Raw source/link</h3>
          <div className="mt-2 break-all text-xs text-muted-foreground">{item.source_url || "-"}</div>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-semibold">View raw HTML</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-white/70 p-3 text-[11px]">{item.raw_html || "Raw HTML not captured."}</pre>
          </details>
        </section>

        <section className="mt-5 soft-card rounded-2xl p-4">
          <h3 className="font-semibold">Raw JSON</h3>
          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-white/70 p-3 text-[11px]">{JSON.stringify(item, null, 2)}</pre>
        </section>
      </aside>
    </div>
  );
}

function LiveConfirm({ open, sources, limit, onCancel, onConfirm, busy }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  useFocusTrap({ active: open, containerRef: panelRef, onEscape: onCancel, initialFocusRef: closeRef });
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
      <div className="absolute inset-0" onClick={onCancel} />
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="live-run-title" className="relative w-full max-w-lg rounded-2xl border border-border bg-[#FBF6EF] p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-1 h-5 w-5 text-amber-700" />
          <div>
            <h2 id="live-run-title" className="font-heading text-xl">Run live scrape?</h2>
            <p className="mt-1 text-sm text-muted-foreground">This creates scrape queue items for admin review. No publishing will occur.</p>
          </div>
        </div>
        <div className="mt-4 max-h-48 overflow-auto rounded-xl bg-white/60 p-3 text-sm">
          {sources.length ? sources.slice(0, 20).map((source) => <div key={source.id} className="flex justify-between gap-3 border-b border-border py-2 last:border-b-0"><span className="truncate">{source.org || source.source_name}</span><span className="shrink-0 text-muted-foreground">{typeLabel(source.source_type)}</span></div>) : <div>All active sources</div>}
          {sources.length > 20 ? <div className="pt-2 text-xs text-muted-foreground">+{sources.length - 20} more sources</div> : null}
        </div>
        <div className="mt-3 text-sm">Max items: <b>{limit}</b></div>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={closeRef} className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={onConfirm}>{busy ? "Running..." : "Run live scrape"}</button>
        </div>
      </div>
    </div>
  );
}

export default function AdminScraper() {
  const [items, setItems] = useState([]);
  const [queue, setQueue] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [running, setRunning] = useState(null);
  const [selected, setSelected] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sourceMode, setSourceMode] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState([]);
  const [queueQuery, setQueueQuery] = useState("");
  const [queueStatus, setQueueStatus] = useState("all");
  const [limit, setLimit] = useState(25);
  const [msg, setMsg] = useState(null);
  const toast = useToast();

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const [runs, q, src] = await Promise.all([
        api.get("/api/admin/scrape/runs"),
        api.get("/api/admin/scrape/queue?status=all"),
        api.get("/api/admin/sources"),
      ]);
      setItems(runs.items || []);
      setQueue(q.items || []);
      setSources(src.items || []);
    } catch (e) {
      setLoadError(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load().catch(() => {}); }, []);

  const filteredSources = useMemo(() => sources.filter((source) => source.is_active !== false && (typeFilter === "all" || source.source_type === typeFilter)), [sources, typeFilter]);
  const runSources = useMemo(() => {
    const ids = selectedSourceIds(sourceMode, selectedIds);
    if (!ids) return filteredSources;
    return filteredSources.filter((source) => ids.includes(source.id));
  }, [filteredSources, selectedIds, sourceMode]);
  const canRunSelected = sourceMode !== "selected" || selectedIds.length > 0;
  const queueStats = useMemo(() => ({
    total: queue.length,
    pending: queue.filter((item) => item.status === "pending").length,
    duplicate: queue.filter((item) => item.status === "duplicate" || item.duplicate_of).length,
    blocked: queue.filter((item) => (item.unverified_fields || []).length > 0).length,
  }), [queue]);
  const workflowMessage = msg && msg.includes("Live run") ? NEXT_ACTION_MESSAGES.reviewQueue : NEXT_ACTION_MESSAGES.runDryFirst;
  const filteredQueue = useMemo(() => {
    const needle = queueQuery.trim().toLowerCase();
    return queue.filter((item) => {
      const extracted = item.extracted_data || {};
      const matchesStatus = queueStatus === "all" || item.status === queueStatus || (queueStatus === "blocked" && (item.unverified_fields || []).length > 0) || (queueStatus === "duplicate" && (item.status === "duplicate" || item.duplicate_of));
      const haystack = `${item.source_name || ""} ${item.source_url || ""} ${extracted.title || extracted.name || ""} ${extracted.organization_name || extracted.organization || ""}`.toLowerCase();
      return matchesStatus && (!needle || haystack.includes(needle));
    });
  }, [queue, queueQuery, queueStatus]);

  async function runDry() {
    setRunning("dry"); setMsg(null);
    try {
      if (!canRunSelected) throw new Error("Select at least one source or switch to all active sources.");
      const r = await api.post("/api/admin/scrape/run-dry", { source_ids: selectedSourceIds(sourceMode, selectedIds), limit: Number(limit) || 25 });
      setMsg(`Dry run ${shortId(r.run_id)} ${r.status}: ${r.items_new} new, ${r.items_duplicate} duplicate.`);
      toast.success("Dry run completed. Review is still required.");
      await load();
    } catch (e) {
      setMsg(`Dry run failed: ${e.message}`);
      toast.error(`Dry run failed: ${e.message}`);
    } finally {
      setRunning(null);
    }
  }

  async function runLive() {
    setRunning("live"); setMsg(null);
    try {
      if (!canRunSelected) throw new Error("Select at least one source or switch to all active sources.");
      const r = await api.post("/api/admin/scrape/run", { source_ids: selectedSourceIds(sourceMode, selectedIds), limit: Number(limit) || 25, force: false });
      setMsg(`Live run ${shortId(r.run_id)} ${r.status}: ${r.items_new} queued for review, ${r.items_duplicate} duplicate.`);
      toast.success("Live scrape queued candidates for review. Nothing was published.");
      setConfirmOpen(false);
      await load();
    } catch (e) {
      setMsg(`Live scrape failed: ${e.message}`);
      toast.error(`Live scrape failed: ${e.message}`);
    } finally {
      setRunning(null);
    }
  }

  const act = async (id, action) => {
    try {
      const r = await api.post(`/api/admin/scrape/items/${id}/${action}`, { notes: "admin review" });
      if (action === "promote") {
        setMsg(`Recruitment draft created. Next: open Recruitments and validate publish readiness. ${JSON.stringify(r)}`);
        toast.success("Recruitment draft created. Next: open Recruitments and validate publish readiness.");
      } else {
        setMsg(`${QUEUE_ACTION_LABELS[action] || action}: ${JSON.stringify(r)}`);
        toast.success(`${QUEUE_ACTION_LABELS[action] || action} completed.`);
      }
      await load();
    } catch (e) {
      const fields = getApiUnverifiedFields(e);
      const text = fields.length ? `Promote blocked. Verify required fields: ${fields.join(", ")}` : `${action} failed: ${e.message}`;
      setMsg(text);
      toast.error(text);
    }
  };

  const fieldAct = async (id, field, action, correctedValue) => {
    try {
      await api.post(`/api/admin/scrape/items/${id}/fields/${field}/${action}`, { notes: "field review", corrected_value: correctedValue });
      toast.success(`${field} ${action} saved.`);
      await load();
    } catch (e) {
      toast.error(`${field} ${action} failed: ${e.message}`);
    }
  };

  const typeOptions = Array.from(new Set(sources.map((source) => source.source_type).filter(Boolean)));

  return (
    <div className="space-y-6" data-testid="admin-scraper">
      <AdminWorkflowStepper currentStep={["Scrape", "Queue Review"]} />
      <NextActionCallout message={workflowMessage} href="/admin/recruitments" actionLabel="Open Recruitments" tone="info" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Scrape queue trust review</h1>
          <p className="mt-1 text-muted-foreground">Promote creates draft/needs_review records only. Publishing remains a separate readiness-gated admin action.</p>
        </div>
        <button onClick={load} className="btn btn-ghost" disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Reload</button>
      </div>

      <div className="grid gap-3 text-sm md:grid-cols-4">
        <Metric label="Queue items" value={queueStats.total} />
        <Metric label="Pending" value={queueStats.pending} />
        <Metric label="Duplicates" value={queueStats.duplicate} />
        <Metric label="Needs field review" value={queueStats.blocked} tone="warn" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <section className="soft-card rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <Search className="mt-1 h-5 w-5 text-clay-700" />
            <div>
              <h2 className="font-semibold">Dry run / discover candidates</h2>
              <p className="text-sm text-muted-foreground">Run dry scrape first. No publishing occurs; review is still required.</p>
            </div>
          </div>
          <button disabled={!!running || !canRunSelected} onClick={runDry} className="btn btn-ghost mt-4"><Play className={`h-4 w-4 ${running === "dry" ? "animate-spin" : ""}`} />{running === "dry" ? "Running..." : "Dry run / discover candidates"}</button>
        </section>
        <section className="soft-card rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <Play className="mt-1 h-5 w-5 text-clay-700" />
            <div>
              <h2 className="font-semibold">Run live scrape</h2>
              <p className="text-sm text-muted-foreground">Creates queue items for review, does not publish.</p>
            </div>
          </div>
          <button disabled={!!running || !canRunSelected} onClick={() => setConfirmOpen(true)} className="btn btn-primary mt-4"><Play className={`h-4 w-4 ${running === "live" ? "animate-spin" : ""}`} />{running === "live" ? "Running..." : "Run live scrape"}</button>
        </section>
      </div>

      <section className="soft-card rounded-2xl p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-sm"><div className="mb-1 text-[11px] uppercase tracking-widest text-muted-foreground">Sources</div><select className="input" value={sourceMode} onChange={(e) => setSourceMode(e.target.value)}><option value="all">All active sources</option><option value="selected">Selected source(s)</option></select></label>
          <label className="text-sm"><div className="mb-1 text-[11px] uppercase tracking-widest text-muted-foreground">Source type</div><select className="input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}><option value="all">All types</option>{typeOptions.map((type) => <option key={type} value={type}>{typeLabel(type)}</option>)}</select></label>
          <label className="text-sm"><div className="mb-1 text-[11px] uppercase tracking-widest text-muted-foreground">Max items</div><input className="input" type="number" min="1" max="100" value={limit} onChange={(e) => setLimit(e.target.value)} /></label>
          <div className="text-sm"><div className="mb-1 text-[11px] uppercase tracking-widest text-muted-foreground">Run scope</div><div className="rounded-xl border border-border bg-white/70 px-3 py-2">{sourceMode === "selected" ? `${selectedIds.length} selected` : `${filteredSources.length} active`}</div></div>
        </div>
        {sourceMode === "selected" && (
          <div className="mt-3 grid max-h-48 gap-2 overflow-auto md:grid-cols-2">
            {filteredSources.map((source) => <label key={source.id} className="flex items-center gap-2 rounded-xl border border-border bg-white/60 p-2 text-sm"><input type="checkbox" checked={selectedIds.includes(source.id)} onChange={(e) => setSelectedIds(e.target.checked ? [...selectedIds, source.id] : selectedIds.filter((id) => id !== source.id))} /><span className="truncate">{source.org || source.source_name}</span><span className="ml-auto text-xs text-muted-foreground">{typeLabel(source.source_type)}</span></label>)}
          </div>
        )}
        {!canRunSelected ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Select at least one source, or switch the run scope back to all active sources.</div> : null}
        <style>{`.input { width:100%; padding: 0.55rem 0.85rem; border-radius: 0.75rem; background: rgba(255,255,255,0.85); border: 1px solid hsl(var(--border)); font-size: 14px; }`}</style>
      </section>

      {msg && <div className="soft-card rounded-xl p-3 text-xs">{msg}</div>}
      {loadError ? <ErrorState title="Failed to load scraper monitor" message={loadError.message} onRetry={load} /> : null}

      <section className="soft-card rounded-2xl p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <span className="sr-only">Search scrape queue</span>
            <input value={queueQuery} onChange={(e) => setQueueQuery(e.target.value)} className="w-full rounded-xl border border-border bg-white/80 py-2 pl-9 pr-3 text-sm" placeholder="Search title, source, URL, organization" />
          </label>
          <label className="relative block">
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <span className="sr-only">Filter queue status</span>
            <select value={queueStatus} onChange={(e) => setQueueStatus(e.target.value)} className="w-full rounded-xl border border-border bg-white/80 py-2 pl-9 pr-3 text-sm">
              <option value="all">All queue items</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="duplicate">Duplicate</option>
              <option value="blocked">Needs field review</option>
            </select>
          </label>
        </div>
      </section>

      {loading ? <LoadingSkeleton variant="table" /> : null}
      {!loading && !loadError && queue.length === 0 ? <EmptyState icon={Search} title="No scrape queue items yet" description="Run a dry scrape or live scrape to discover candidates for manual review." /> : null}
      {!loading && !loadError && queue.length > 0 && filteredQueue.length === 0 ? <EmptyState icon={Filter} title="No queue items match this view" description="Adjust the search or queue status filter." /> : null}

      {!loading && !loadError && filteredQueue.length > 0 ? <div className="overflow-auto rounded-2xl border border-border bg-white/70">
        <table className="w-full min-w-[1040px] table-fixed text-xs">
          <thead className="bg-[#FBF6EF] text-left text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <tr>
              <th className="w-[220px] px-3 py-3">Source</th>
              <th className="w-[260px] px-3 py-3">Title</th>
              <th className="w-[160px] px-3 py-3">Org guess</th>
              <th className="w-[150px] px-3 py-3">Dates</th>
              <th className="w-[170px] px-3 py-3">Signals</th>
              <th className="w-[160px] px-3 py-3">Status</th>
              <th className="w-[190px] px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredQueue.map((q) => {
              const e = q.extracted_data || {};
              const blocked = q.unverified_fields || [];
              return (
                <tr key={q.id} className="border-t border-border align-middle" data-testid={`scrape-row-${q.id}`}>
                  <td className="px-3 py-3"><div className="truncate font-medium">{q.source_name}</div><div className="truncate text-[10px] text-muted-foreground">{q.source_url}</div></td>
                  <td className="px-3 py-3"><div className="truncate font-medium">{e.title || e.name || "-"}</div><div className="truncate text-[10px] text-muted-foreground">{shortId(q.id)}</div></td>
                  <td className="truncate px-3 py-3">{e.organization_name || e.organization || "-"}</td>
                  <td className="truncate px-3 py-3">{e.apply_start_date || "-"} to {e.apply_end_date || "-"}</td>
                  <td className="px-3 py-3"><div>conf {q.confidence_score ?? "-"}</div><div className="text-[10px] text-muted-foreground">quality {q.data_quality_score ?? "-"}</div></td>
                  <td className="px-3 py-3"><div className="flex flex-wrap gap-1"><StatusBadge status={q.status} label={q.status} /><StatusBadge status={q.duplicate_of ? "duplicate" : "new"} label={q.duplicate_of ? "Duplicate" : "New"} /><StatusBadge status={q.extraction_status || "unknown"} label={q.extraction_status || "unknown"} /><StatusBadge status={q.source_type || "unknown"} label={typeLabel(q.source_type)} /></div>{blocked.length ? <div className="mt-1 truncate text-[10px] text-amber-700">Verify: {blocked.join(", ")}</div> : null}</td>
                  <td className="px-3 py-3"><div className="flex flex-wrap gap-1"><button className="btn btn-ghost h-8 text-xs" onClick={() => setSelected(q)}><Eye className="h-3.5 w-3.5" />Details</button><button className="btn btn-primary h-8 text-xs" disabled={!q.promotable} onClick={() => act(q.id, "promote")}>Promote to recruitment draft</button></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div> : null}

      <section className="soft-card rounded-2xl p-4">
        <h2 className="font-semibold">Recent runs</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {items.slice(0, 6).map((run) => <div key={run.id} className="rounded-xl border border-border bg-white/60 p-3 text-xs"><div className="flex items-center justify-between gap-2"><div className="font-mono">{shortId(run.id)}</div><StatusBadge status={run.status} label={run.status} /></div><div className="mt-2">seen {run.items_seen} / new {run.items_new} / dup {run.items_duplicate}</div><div className="mt-1 truncate text-muted-foreground">{run.at || "-"}</div></div>)}
        </div>
      </section>

      <QueueDetailDrawer item={selected} onClose={() => setSelected(null)} onAction={act} onFieldAction={fieldAct} />
      <LiveConfirm open={confirmOpen} sources={sourceMode === "selected" ? runSources : []} limit={limit} busy={running === "live"} onCancel={() => setConfirmOpen(false)} onConfirm={runLive} />
    </div>
  );
}

function Info({ label, value }) {
  return <div className="rounded-xl border border-border bg-white/60 p-3 text-sm"><div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div><div className="break-words">{value || "-"}</div></div>;
}

function Metric({ label, value, tone }) {
  const toneClass = tone === "warn" ? "text-amber-700" : "text-foreground";
  return <div className="soft-card rounded-2xl p-4"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div><div className={`mt-1 font-heading text-3xl ${toneClass}`}>{value}</div></div>;
}
