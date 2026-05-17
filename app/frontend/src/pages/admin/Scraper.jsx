import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Eye, Filter, Play, RefreshCw, Search, X } from "lucide-react";
import { api, getApiExistingRecruitmentId, getApiNextActions, getApiUnverifiedFields } from "../../lib/api";
import AdminWorkflowStepper from "../../features/admin/workflow/AdminWorkflowStepper";
import NextActionCallout from "../../features/admin/workflow/NextActionCallout";
import FieldReviewGroup from "../../features/admin/workflow/FieldReviewGroup";
import PromotionPreviewPanel from "../../features/admin/workflow/PromotionPreviewPanel";
import ScrapeRunDetailDrawer from "../../features/admin/scraping/ScrapeRunDetailDrawer";
import InlineAuditTimeline from "../../features/admin/shared/InlineAuditTimeline";
import { HIGH_RISK_QUEUE_FIELDS, NEXT_ACTION_MESSAGES, RECOMMENDED_REVIEW_FIELDS, SOURCE_TYPE_LABELS } from "../../features/admin/workflow/adminWorkflowContract";
import { useFocusTrap } from "../../shared/a11y/useFocusTrap";
import { EmptyState, ErrorState, LoadingSkeleton, StatusBadge, useToast } from "../../shared/ui";
import { formatScorePct } from "../../features/admin/workflow/scoreUtils";

function shortId(value) {
  return value ? String(value).slice(0, 8) : "-";
}

function typeLabel(value) {
  return SOURCE_TYPE_LABELS[value] || value || "Unknown";
}

function selectedSourceIds(mode, selected) {
  return mode === "selected" ? selected : null;
}

function reviewState(item) {
  if (item.status === "rejected") return { key: "rejected", label: "Rejected", reason: "Candidate rejected" };
  if (item.status === "merged") return { key: "merged", label: "Merged", reason: "Merged into existing recruitment" };
  if (item.promoted_recruitment_id) return { key: "promoted", label: "Promoted", reason: "Draft created" };
  if (item.status === "duplicate" || item.duplicate_of || (item.duplicate_candidates || []).length) return { key: "duplicate", label: "Duplicate", reason: "Existing recruitment candidate found" };
  if ((item.unverified_fields || []).length) return { key: "blocked", label: "Needs review", reason: `Verify: ${item.unverified_fields.join(", ")}` };
  if (item.promotable) return { key: "ready", label: "Ready to promote", reason: "Required fields verified" };
  return { key: "pending", label: "Pending", reason: "Awaiting review" };
}

function QueueDetailDrawer({ item, onClose, onAction, onFieldAction, onMerge }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  useFocusTrap({ active: !!item, containerRef: panelRef, onEscape: onClose, initialFocusRef: closeRef });
  // Bumping previewKey forces PromotionPreviewPanel to refetch. We bump it
  // after every field action so the preview reflects the latest evidence
  // without the reviewer having to click Refresh.
  const [previewKey, setPreviewKey] = useState(0);
  const handleFieldAction = (id, field, action, correctedValue) => {
    setPreviewKey((k) => k + 1);
    return onFieldAction(id, field, action, correctedValue);
  };
  if (!item) return null;
  const extracted = item.extracted_data || {};
  // The bare ``field_evidence`` JSON fallback was a leftover from the
  // pre-relational evidence schema; the backend now always populates
  // ``field_evidence_status`` from the relational table, so the fallback
  // is dead. Removed as part of Sprint 5 wire-contract cleanup.
  const evidence = item.field_evidence_status || {};
  const evidenceDetails = item.field_evidence_details || [];
  const state = reviewState(item);
  const primaryDuplicate = (item.duplicate_candidates || [])[0];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="absolute inset-0" onClick={onClose} />
      <aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="queue-detail-title" className="relative h-full w-full max-w-3xl overflow-auto border-l border-border bg-[#FBF6EF] p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Scrape queue item</div>
            <h2 id="queue-detail-title" className="truncate font-heading text-2xl">{extracted.title || extracted.name || item.source_name || "Candidate"}</h2>
            <p className="mt-1 text-xs text-muted-foreground">Queue {shortId(item.id)} · {item.source_name || "Unknown source"} · {typeLabel(item.source_type)}</p>
          </div>
          <button ref={closeRef} className="btn btn-ghost h-9 w-9 p-0" onClick={onClose} aria-label="Close queue details"><X className="h-4 w-4" /></button>
        </div>

        <section className="mt-5 grid gap-3 md:grid-cols-2">
          <Info label="Source" value={item.source_name} />
          <Info label="Source type" value={typeLabel(item.source_type)} />
          <Info label="Organization" value={extracted.organization_name || extracted.organization} />
          <Info label="Dates" value={`${extracted.apply_start_date || "-"} to ${extracted.apply_end_date || "-"}`} />
          <Info label="Duplicate" value={item.duplicate_of || "No canonical duplicate linked"} />
          <Info label="Official provenance" value={item.official_source_resolved ? `Resolved${item.official_source_host ? ` · ${item.official_source_host}` : ""}` : "Required / unresolved"} />
          <Info label="Resolver reason" value={(extracted._meta && extracted._meta.resolver_reason) || (item.official_source_resolved ? "matched" : null)} />
        </section>

        {primaryDuplicate ? (
          <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <h3 className="font-semibold">Duplicate candidate found</h3>
            <p className="mt-1">Compare with existing recruitment before creating a new draft.</p>
            <div className="mt-3 rounded-xl bg-white/70 p-3 text-xs">
              <div className="font-semibold">{primaryDuplicate.name}</div>
              <div>Score: {primaryDuplicate.score ?? "-"} · {(primaryDuplicate.reasons || []).join(", ") || "match"}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <a className="btn btn-ghost h-8 text-xs" href={`/admin/recruitments?open=${primaryDuplicate.recruitment_id}`}>Open recruitment</a>
                <button className="btn btn-primary h-8 text-xs" onClick={() => onMerge(item.id, primaryDuplicate.recruitment_id)}>Merge reviewed fields</button>
              </div>
            </div>
          </section>
        ) : null}

        <div className="mt-5">
          <PromotionPreviewPanel
            queueId={item.id}
            open={true}
            refreshKey={previewKey}
            onScrollToField={(field) => {
              document.getElementById("queue-field-review")?.scrollIntoView({ block: "start" });
              // Field-specific anchors are not stable across renders today;
              // scrolling to the section is the most reliable next-step
              // surface until FieldRow gets an id attribute.
            }}
          />
        </div>

        <section className="mt-5 soft-card rounded-2xl p-4">
          <h3 className="font-semibold">Next action: {state.label}</h3>
          <p className="mt-1 text-sm text-muted-foreground">Promotion creates a canonical recruitment draft with publish_status=needs_review. It does not publish and does not send alerts.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {state.key === "blocked" ? <button className="btn btn-primary" onClick={() => document.getElementById("queue-field-review")?.scrollIntoView({ block: "start" })}>Review missing fields</button> : null}
            {state.key === "ready" ? <button className="btn btn-primary" onClick={() => onAction(item.id, "promote")}>Promote to new recruitment draft</button> : null}
            {state.key === "duplicate" ? <button className="btn btn-primary" onClick={() => primaryDuplicate && onMerge(item.id, primaryDuplicate.recruitment_id)} disabled={!primaryDuplicate}>Merge into existing recruitment</button> : null}
            {(state.key === "duplicate") ? <button className="btn btn-ghost" onClick={() => onAction(item.id, "mark-duplicate")}>Mark duplicate</button> : null}
            {["promoted", "merged"].includes(state.key) && item.promoted_recruitment_id ? <a className="btn btn-primary" href={`/admin/recruitments?open=${item.promoted_recruitment_id}`}>Open recruitment</a> : null}
            {!["promoted", "merged", "rejected"].includes(state.key) ? <button className="btn btn-ghost" onClick={() => onAction(item.id, "reject")}>Reject candidate</button> : null}
          </div>
          {item.unverified_fields?.length ? <div className="mt-2 text-xs text-amber-700">Backend blockers: {item.unverified_fields.join(", ")}</div> : null}
        </section>

        <section id="queue-field-review" className="mt-5 soft-card rounded-2xl p-4">
          <h3 className="font-semibold">Field evidence</h3>
          <div className="mt-3">
            <FieldReviewGroup
              extracted={extracted}
              evidence={evidence}
              evidenceDetails={evidenceDetails}
              requiredFields={HIGH_RISK_QUEUE_FIELDS}
              recommendedFields={RECOMMENDED_REVIEW_FIELDS}
              onFieldAction={(field, action, correctedValue) => handleFieldAction(item.id, field, action, correctedValue)}
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

        <div className="mt-5">
          <InlineAuditTimeline entityType="scrape_queue" entityId={item.id} title="Queue item audit timeline" />
        </div>
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
  const [queueFilter, setQueueFilter] = useState("pending");
  const [queueSort, setQueueSort] = useState("risky_first");
  const [queueRisk, setQueueRisk] = useState("all");
  const [queueTotal, setQueueTotal] = useState(null);
  const [runDetailId, setRunDetailId] = useState(null);
  const [limit, setLimit] = useState(25);
  const [msg, setMsg] = useState(null);
  const toast = useToast();

  // Reloads the queue from the server using the active filter/sort/search
  // controls. Pulled out of ``load`` so the typing-debounced query input
  // can refetch without re-fetching runs and sources every keystroke.
  const reloadQueue = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("status", queueFilter || "pending");
    params.set("sort", queueSort || "risky_first");
    if (queueRisk && queueRisk !== "all") params.set("risk", queueRisk);
    if (queueQuery.trim()) params.set("q", queueQuery.trim());
    params.set("limit", "100");
    try {
      const q = await api.get(`/api/admin/scrape/queue?${params.toString()}`);
      setQueue(q.items || []);
      setQueueTotal(typeof q.total === "number" ? q.total : null);
    } catch (e) {
      // Surface as a load error if the initial fetch never succeeded; once
      // we have a page rendered, silently keep the previous data and let
      // the next reload retry. A toast would be noisy on every keystroke.
      if (loading) setLoadError(e);
    }
  }, [queueFilter, queueQuery, queueRisk, queueSort, loading]);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const [runs, src] = await Promise.all([
        api.get("/api/admin/scrape/runs"),
        api.get("/api/admin/sources"),
      ]);
      setItems(runs.items || []);
      setSources(src.items || []);
      await reloadQueue();
    } catch (e) {
      setLoadError(e);
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load().catch(() => {}); }, []);

  // Debounce the search input so backend isn't hammered while typing.
  useEffect(() => {
    if (loading) return;
    const handle = setTimeout(() => { reloadQueue().catch(() => {}); }, 250);
    return () => clearTimeout(handle);
  }, [queueQuery, queueFilter, queueRisk, queueSort, reloadQueue, loading]);

  const filteredSources = useMemo(() => sources.filter((source) => source.is_active !== false && (typeFilter === "all" || source.source_type === typeFilter)), [sources, typeFilter]);
  const runSources = useMemo(() => {
    const ids = selectedSourceIds(sourceMode, selectedIds);
    if (!ids) return filteredSources;
    return filteredSources.filter((source) => ids.includes(source.id));
  }, [filteredSources, selectedIds, sourceMode]);
  const canRunSelected = sourceMode !== "selected" || selectedIds.length > 0;
  const workflowMessage = msg && msg.includes("Live run") ? NEXT_ACTION_MESSAGES.reviewQueue : NEXT_ACTION_MESSAGES.runDryFirst;
  // Server-side filter/search/sort delivers the queue already shaped; no
  // client-side re-filtering. Keeping a pass-through binding so the table
  // and stats can stay on a single variable name.
  const visibleQueue = queue;

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
    let notes = "admin review";
    if (action === "reject") {
      const reason = window.prompt("Reject this candidate? Enter a reason (required):", "");
      if (reason == null) return; // user cancelled
      const trimmed = reason.trim();
      if (!trimmed) { setMsg("Reject cancelled — reason is required."); toast.error("Reject cancelled — reason is required."); return; }
      notes = trimmed;
    }
    try {
      const r = await api.post(`/api/admin/scrape/items/${id}/${action}`, { notes });
      if (action === "promote") {
        setMsg(`Recruitment draft created. Next: open Recruitments and validate publish readiness. ${JSON.stringify(r)}`);
        toast.success("Recruitment draft created. Next: open Recruitments and validate publish readiness.");
      } else {
        setMsg(`${action}: ${JSON.stringify(r)}`);
        toast.success(`${action} completed.`);
      }
      await load();
    } catch (e) {
      const fields = getApiUnverifiedFields(e);
      const existingId = getApiExistingRecruitmentId(e);
      const nextActions = getApiNextActions(e);
      const text = fields.length
        ? `Promote blocked. Verify required fields: ${fields.join(", ")}`
        : existingId
          ? `Duplicate recruitment exists (${existingId.slice(0, 8)}). Next: ${nextActions.join(", ") || "compare or merge reviewed fields."}`
          : `${action} failed: ${e.message}`;
      setMsg(text);
      toast.error(text);
    }
  };

  const mergeIntoRecruitment = async (queueId, recruitmentId) => {
    try {
      const r = await api.post(`/api/admin/scrape/items/${queueId}/merge-into/${recruitmentId}`, { notes: "duplicate merge from scraper queue" });
      setMsg(`Merged into existing recruitment. Updated: ${(r.updated_fields || []).join(", ") || "none"}.`);
      toast.success("Merged into existing recruitment.");
      await load();
      setSelected(null);
    } catch (e) {
      const text = `Merge failed: ${e.message}`;
      setMsg(text);
      toast.error(text);
    }
  };

  const fieldAct = async (id, field, action, correctedValue, scope) => {
    const body = {
      notes: scope?.notes || "field review",
      corrected_value: correctedValue,
      entity_type: scope?.entity_type || null,
      entity_key: scope?.entity_key || null,
    };
    try {
      await api.post(`/api/admin/scrape/items/${id}/fields/${field}/${action}`, body);
      toast.success(`${field} ${action} saved.`);
      await load();
    } catch (e) {
      toast.error(`${field} ${action} failed: ${e.message}`);
    }
  };

  const typeOptions = Array.from(new Set(sources.map((source) => source.source_type).filter(Boolean)));

  return (
    <div className="space-y-6" data-testid="admin-scraper">
      <AdminWorkflowStepper currentStep={["Scrape", "Candidate review"]} />
      <NextActionCallout message={workflowMessage} href="/admin/recruitments" actionLabel="Open Recruitments" tone="info" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Scrape queue trust review</h1>
          <p className="mt-1 text-muted-foreground">Promote creates draft/needs_review records only. Publishing remains a separate readiness-gated admin action.</p>
        </div>
        <button onClick={load} className="btn btn-ghost" disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Reload</button>
      </div>

      {/* Status pills mirror scrape_queue.status values one-for-one so the
          backend can do the filtering. The "Risk" and "Sort" dropdowns layer
          on top — official_unresolved / low_quality / needs_review are
          orthogonal to status (e.g. a pending item with low quality). */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          ["pending", "Pending"],
          ["approved", "Promoted"],
          ["duplicate", "Duplicates"],
          ["merged", "Merged"],
          ["rejected", "Rejected"],
          ["all", "All"],
        ].map(([key, label]) => (
          <button key={key} type="button" onClick={() => setQueueFilter(key)} className={`rounded-full border px-3 py-1.5 text-xs ${queueFilter === key ? "border-dusk-700 bg-dusk-700 text-white" : "border-border bg-white/70 text-foreground/75 hover:bg-clay-100"}`}>
            {label}
          </button>
        ))}
        <label className="ml-2 text-xs">
          <span className="mr-1 uppercase tracking-widest text-[10px] text-muted-foreground">Risk</span>
          <select value={queueRisk} onChange={(e) => setQueueRisk(e.target.value)} className="rounded-lg border border-border bg-white/80 px-2 py-1 text-xs">
            <option value="all">Any</option>
            <option value="official_unresolved">Official unresolved</option>
            <option value="low_quality">Low quality</option>
            <option value="needs_review">Needs review</option>
          </select>
        </label>
        <label className="text-xs">
          <span className="mr-1 uppercase tracking-widest text-[10px] text-muted-foreground">Sort</span>
          <select value={queueSort} onChange={(e) => setQueueSort(e.target.value)} className="rounded-lg border border-border bg-white/80 px-2 py-1 text-xs">
            <option value="risky_first">Risky first</option>
            <option value="quality_asc">Lowest quality first</option>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
        {queueTotal != null ? <span className="ml-auto text-xs text-muted-foreground">{queueTotal} match{queueTotal === 1 ? "" : "es"}</span> : null}
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
        <div className="grid gap-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <span className="sr-only">Search scrape queue</span>
            <input value={queueQuery} onChange={(e) => setQueueQuery(e.target.value)} className="w-full rounded-xl border border-border bg-white/80 py-2 pl-9 pr-3 text-sm" placeholder="Search title, source, URL, organization" />
          </label>
        </div>
      </section>

      {loading ? <LoadingSkeleton variant="table" /> : null}
      {!loading && !loadError && queue.length === 0 ? <EmptyState icon={Search} title="No scrape queue items yet" description="Run a dry scrape or live scrape to discover candidates for manual review." /> : null}
      {!loading && !loadError && queue.length > 0 && visibleQueue.length === 0 ? <EmptyState icon={Filter} title="No queue items match this view" description="Adjust search or filter chips." /> : null}

      {!loading && !loadError && visibleQueue.length > 0 ? <div className="overflow-auto rounded-2xl border border-border bg-white/70">
        <table className="w-full min-w-[900px] table-fixed text-xs">
          <thead className="bg-[#FBF6EF] text-left text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <tr>
              <th className="w-[280px] px-3 py-3">Candidate</th>
              <th className="w-[260px] px-3 py-3">Source / URL</th>
              <th className="w-[180px] px-3 py-3">Review state</th>
              <th className="w-[120px] px-3 py-3">Data quality</th>
              <th className="w-[190px] px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleQueue.map((q) => {
              const e = q.extracted_data || {};
              const state = reviewState(q);
              return (
                <tr key={q.id} className="border-t border-border align-middle" data-testid={`scrape-row-${q.id}`}>
                  <td className="px-3 py-3"><div className="truncate font-medium">{e.title || e.name || "-"}</div><div className="truncate text-[10px] text-muted-foreground">Queue {shortId(q.id)} · {q.source_name || "-"}</div></td>
                  <td className="px-3 py-3"><div className="truncate">{typeLabel(q.source_type)}</div><div className="truncate text-[10px] text-muted-foreground">{q.source_url}</div></td>
                  <td className="px-3 py-3"><StatusBadge status={state.key} label={state.label} /><div className="mt-1 truncate text-[10px] text-muted-foreground">{state.reason}</div></td>
                  <td className="px-3 py-3"><div>conf {formatScorePct(q.confidence_score)}</div><div className="text-[10px] text-muted-foreground">quality {formatScorePct(q.data_quality_score)}</div></td>
                  <td className="px-3 py-3"><QueueRowAction item={q} state={state} onOpen={() => setSelected(q)} onPromote={() => act(q.id, "promote")} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div> : null}

      <section className="soft-card rounded-2xl p-4">
        <h2 className="font-semibold">Recent runs</h2>
        <p className="mt-1 text-xs text-muted-foreground">Click a row for per-source breakdown, errors, and quality range.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {items.slice(0, 6).map((run) => (
            <button
              key={run.id}
              type="button"
              onClick={() => setRunDetailId(run.id)}
              className="rounded-xl border border-border bg-white/60 p-3 text-left text-xs hover:bg-clay-100"
              data-testid={`scrape-run-card-${run.id}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-mono">{shortId(run.id)}</div>
                <StatusBadge status={run.status} label={run.status} />
              </div>
              <div className="mt-2">seen {run.items_seen} / new {run.items_new} / dup {run.items_duplicate}</div>
              <div className="mt-1 truncate text-muted-foreground">{run.at || "-"}</div>
            </button>
          ))}
        </div>
      </section>

      <QueueDetailDrawer item={selected} onClose={() => setSelected(null)} onAction={act} onFieldAction={fieldAct} onMerge={mergeIntoRecruitment} />
      <LiveConfirm open={confirmOpen} sources={sourceMode === "selected" ? runSources : []} limit={limit} busy={running === "live"} onCancel={() => setConfirmOpen(false)} onConfirm={runLive} />
      <ScrapeRunDetailDrawer runId={runDetailId} open={!!runDetailId} onClose={() => setRunDetailId(null)} />
    </div>
  );
}

function QueueRowAction({ item, state, onOpen, onPromote }) {
  if (["blocked", "duplicate", "rejected"].includes(state.key)) {
    return <button className="btn btn-primary h-8 text-xs" onClick={onOpen}><Eye className="h-3.5 w-3.5" />{state.key === "duplicate" ? "Compare / Merge" : state.key === "rejected" ? "View" : "Review fields"}</button>;
  }
  if (state.key === "ready") {
    return <button className="btn btn-primary h-8 text-xs" onClick={onPromote}>Promote</button>;
  }
  if (["promoted", "merged"].includes(state.key) && item.promoted_recruitment_id) {
    return <a className="btn btn-primary h-8 text-xs" href={`/admin/recruitments?open=${item.promoted_recruitment_id}`}>Open recruitment</a>;
  }
  return <button className="btn btn-ghost h-8 text-xs" onClick={onOpen}><Eye className="h-3.5 w-3.5" />View</button>;
}

function Info({ label, value }) {
  return <div className="rounded-xl border border-border bg-white/60 p-3 text-sm"><div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div><div className="break-words">{value || "-"}</div></div>;
}
