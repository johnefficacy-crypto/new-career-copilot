import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LayoutGrid, RefreshCw } from "lucide-react";
import { api, getApiUnverifiedFields } from "../../lib/api";
import { EmptyState, ErrorState, LoadingSkeleton, StatusBadge } from "../../shared/ui";
import useAdminAction from "../../features/admin/shared/useAdminAction";
import AdminProgressBar from "../../features/admin/workflow/AdminProgressBar";
import AdminActionChecklist from "../../features/admin/workflow/AdminActionChecklist";
import AdminFixPanel from "../../features/admin/workflow/AdminFixPanel";
import NextActionCallout from "../../features/admin/workflow/NextActionCallout";
import useAdminNextActions from "../../features/admin/workflow/useAdminNextActions";

const TABS = [
  { id: "source", label: "Source Setup" },
  { id: "scrape", label: "Scrape Run" },
  { id: "queue", label: "Queue Review" },
  { id: "draft", label: "Draft Fixes" },
  { id: "publish", label: "Validate / Verify / Publish" },
  { id: "eligibility", label: "Eligibility Ops" },
];

export default function OperationsConsole() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sourceId = searchParams.get("source_id") || null;
  const queueId = searchParams.get("queue_id") || null;
  const recruitmentId = searchParams.get("recruitment_id") || null;
  const tab = searchParams.get("tab") || "source";

  const [sources, setSources] = useState([]);
  const [runs, setRuns] = useState([]);
  const [queue, setQueue] = useState([]);
  const [recruitments, setRecruitments] = useState([]);
  const [validateResult, setValidateResult] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  const { runAction, busyKey, error: actionError } = useAdminAction();

  const updateParams = useCallback((next) => {
    const merged = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([k, v]) => {
      if (v == null || v === "") merged.delete(k);
      else merged.set(k, String(v));
    });
    setSearchParams(merged, { replace: false });
  }, [searchParams, setSearchParams]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [s, r, q, recs] = await Promise.all([
        api.get("/api/admin/sources"),
        api.get("/api/admin/scrape/runs?limit=10"),
        api.get("/api/admin/scrape/queue?status=pending&limit=50"),
        api.get("/api/admin/recruitments"),
      ]);
      setSources(s.items || []);
      setRuns(r.items || []);
      setQueue(q.items || []);
      setRecruitments(recs.items || []);
    } catch (e) {
      setLoadError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const selectedSource = useMemo(
    () => sources.find((s) => s.id === sourceId) || null,
    [sources, sourceId],
  );
  const selectedQueueItem = useMemo(
    () => queue.find((q) => q.id === queueId) || null,
    [queue, queueId],
  );
  const selectedRecruitment = useMemo(
    () => recruitments.find((r) => r.id === recruitmentId) || null,
    [recruitments, recruitmentId],
  );
  const latestRun = runs[0] || null;

  // Auto-validate when recruitment selection changes
  useEffect(() => {
    setValidateResult(null);
    if (!recruitmentId) return;
    let cancelled = false;
    api.post(`/api/admin/recruitments/${recruitmentId}/validate-publish`, {})
      .then((r) => { if (!cancelled) setValidateResult(r); })
      .catch(() => { if (!cancelled) setValidateResult(null); });
    return () => { cancelled = true; };
  }, [recruitmentId]);

  const progressState = useMemo(() => ({
    source: selectedSource,
    latestRun,
    queueItem: selectedQueueItem,
    recruitment: selectedRecruitment,
    validateResult,
  }), [selectedSource, latestRun, selectedQueueItem, selectedRecruitment, validateResult]);

  const checklistItems = useAdminNextActions(progressState);

  const onStepClick = useCallback((stepId) => {
    const map = {
      source_ready: "source",
      dry_scrape: "scrape",
      live_scrape: "scrape",
      queue_review: "queue",
      field_fixes: "draft",
      official_source_resolved: "draft",
      promoted_draft: "draft",
      draft_blockers_fixed: "publish",
      validated: "publish",
      verified: "publish",
      published: "publish",
      eligibility_monitored: "eligibility",
    };
    updateParams({ tab: map[stepId] || tab });
  }, [tab, updateParams]);

  const onJumpToChecklistTarget = useCallback((target) => {
    if (!target) return;
    const tabMap = {
      "source-list": "source",
      "run-controls": "scrape",
      "queue-list": "queue",
      "fix-panel": "draft",
      "recruitment-fixes": "publish",
      "eligibility-ops": "eligibility",
    };
    if (tabMap[target]) updateParams({ tab: tabMap[target] });
  }, [updateParams]);

  // ── Actions ─────────────────────────────────────────────────────────
  const queueFieldAction = useCallback(async (id, field, action, correctedValue) => {
    await runAction({
      key: `field-${id}-${field}-${action}`,
      successMessage: `${field} ${action} saved.`,
      action: async () => {
        await api.post(`/api/admin/scrape/items/${id}/fields/${field}/${action}`, { notes: "operations console", corrected_value: correctedValue });
        await loadAll();
      },
    });
  }, [runAction, loadAll]);

  const promote = useCallback(async (item) => {
    await runAction({
      key: `promote-${item.id}`,
      successMessage: "Recruitment draft created. Next: validate publish readiness.",
      action: async () => {
        try {
          const r = await api.post(`/api/admin/scrape/items/${item.id}/promote`, {});
          setMsg(`Promoted to recruitment ${(r.recruitment_id || "unknown").slice(0, 8)}. No alerts sent.`);
          await loadAll();
          updateParams({ recruitment_id: r.recruitment_id, tab: "publish" });
        } catch (e) {
          const fields = getApiUnverifiedFields(e);
          if (fields.length) setMsg(`Promote blocked. Verify required fields: ${fields.join(", ")}.`);
          throw e;
        }
      },
    });
  }, [runAction, loadAll, updateParams]);

  const validate = useCallback(async (rec) => {
    await runAction({
      key: `validate-${rec.id}`,
      successMessage: "Validation refreshed.",
      action: async () => {
        const r = await api.post(`/api/admin/recruitments/${rec.id}/validate-publish`, {});
        setValidateResult(r);
      },
    });
  }, [runAction]);

  const verify = useCallback(async (rec) => {
    await runAction({
      key: `verify-${rec.id}`,
      confirm: `Mark "${rec.name}" verified?`,
      successMessage: "Recruitment marked verified.",
      action: async () => {
        await api.post(`/api/admin/recruitments/${rec.id}/verify`, {});
        await loadAll();
      },
    });
  }, [runAction, loadAll]);

  const publish = useCallback(async (rec) => {
    await runAction({
      key: `publish-${rec.id}`,
      confirm: `Publish "${rec.name}"? This triggers alerts.`,
      successMessage: "Recruitment published.",
      action: async () => {
        await api.post(`/api/admin/recruitments/${rec.id}/publish`, {});
        await loadAll();
      },
    });
  }, [runAction, loadAll]);

  const runScrape = useCallback(async (mode) => {
    const key = mode === "dry" ? "scrape-dry" : "scrape-live";
    await runAction({
      key,
      confirm: mode === "dry" ? null : "Run live scrape now? Live scrape only queues candidates; it does not publish.",
      successMessage: mode === "dry" ? "Dry scrape complete." : "Live scrape complete.",
      action: async () => {
        const body = sourceId ? { source_ids: [sourceId], limit: 25 } : { limit: 25 };
        await api.post(mode === "dry" ? "/api/admin/scrape/run-dry" : "/api/admin/scrape/run", body);
        await loadAll();
      },
    });
  }, [runAction, loadAll, sourceId]);

  if (loading && !sources.length && !queue.length) return <LoadingSkeleton variant="table" />;
  if (loadError) return <ErrorState title="Failed to load Operations Console" message={loadError.message} onRetry={loadAll} />;

  return (
    <div className="space-y-4" data-testid="admin-operations-console">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Operations</div>
          <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
            <LayoutGrid className="h-6 w-6" /> Scraper Operations Console
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            One page for the entire scraper-to-publish pipeline. Backend trust gates remain source of truth.
          </p>
        </div>
        <button type="button" className="btn btn-ghost h-9 text-xs" onClick={loadAll} data-testid="ops-refresh">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <AdminProgressBar state={progressState} onStepClick={onStepClick} />

      <NextActionCallout
        message={firstActionableMessage(checklistItems)}
        tone={anyBlocked(checklistItems) ? "warn" : "info"}
      />

      {msg ? <div className="rounded-xl bg-sage-100/60 border border-sage-200 p-3 text-xs" data-testid="ops-msg">{msg}</div> : null}
      {actionError ? <div className="text-xs text-destructive">{actionError.message}</div> : null}

      <div className="flex flex-wrap gap-2 border-b border-border pb-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => updateParams({ tab: t.id })}
            className={`rounded-full border px-3 py-1.5 text-xs ${tab === t.id ? "border-dusk-700 bg-dusk-700 text-white" : "border-border bg-white/70 text-foreground/75 hover:bg-clay-100"}`}
            data-testid={`ops-tab-${t.id}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-3" data-testid="ops-left-column">
          <AdminActionChecklist items={checklistItems} onJump={onJumpToChecklistTarget} />
          {tab === "source" && (
            <SourceList sources={sources} selectedId={sourceId} onSelect={(id) => updateParams({ source_id: id })} />
          )}
          {tab === "scrape" && (
            <ScrapeRunPanel
              runs={runs}
              source={selectedSource}
              onRunDry={() => runScrape("dry")}
              onRunLive={() => runScrape("live")}
              busy={Boolean(busyKey)}
            />
          )}
          {tab === "queue" && (
            <QueueList items={queue} selectedId={queueId} onSelect={(id) => updateParams({ queue_id: id, tab: "draft" })} />
          )}
          {(tab === "draft" || tab === "publish") && (
            <RecruitmentList items={recruitments} selectedId={recruitmentId} onSelect={(id) => updateParams({ recruitment_id: id })} />
          )}
          {tab === "eligibility" && (
            <EligibilityOpsLink />
          )}
        </div>

        <div className="space-y-3" data-testid="ops-workspace">
          <AdminFixPanel
            queueItem={tab === "draft" ? selectedQueueItem : null}
            recruitment={tab === "publish" ? selectedRecruitment : null}
            validateResult={validateResult}
            onQueueFieldAction={queueFieldAction}
            onPromote={promote}
            onValidate={validate}
            onVerify={verify}
            onPublish={publish}
            onOpenOfficialSourceResolver={() => updateParams({ tab: "draft" })}
            busy={Boolean(busyKey)}
          />
        </div>
      </div>
    </div>
  );
}

function firstActionableMessage(items) {
  const blocked = items.find((i) => i.status === "blocked");
  if (blocked) return `Blocked: ${blocked.label} — ${blocked.reason || "see fix panel"}`;
  const todo = items.find((i) => i.status === "todo");
  if (todo) return `Next: ${todo.label}`;
  return "All checklist items complete.";
}

function anyBlocked(items) {
  return items.some((i) => i.status === "blocked");
}

function SourceList({ sources, selectedId, onSelect }) {
  if (!sources.length) return <EmptyState title="No sources yet" description="Add a source from the Source Registry." actionLabel="Open Source Registry" actionHref="/admin/sources" />;
  return (
    <section className="soft-card rounded-2xl p-3" data-testid="ops-source-list">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Sources</div>
      <ul className="space-y-1">
        {sources.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => onSelect(s.id)} className={`w-full text-left rounded-xl border px-3 py-2 text-sm ${selectedId === s.id ? "border-dusk-700 bg-dusk-700/10" : "border-border bg-white/60"}`} data-testid={`ops-source-${s.id}`}>
              <div className="font-semibold truncate">{s.org}</div>
              <div className="text-[11px] text-muted-foreground truncate">{s.source_type || s.kind || "-"} · {s.is_verified ? "verified" : s.source_type === "aggregator" ? "discovery-only" : "unverified"}</div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ScrapeRunPanel({ runs, source, onRunDry, onRunLive, busy }) {
  return (
    <section className="soft-card rounded-2xl p-3" data-testid="ops-scrape-run">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Scrape</div>
      <div className="flex flex-wrap gap-2 mb-3">
        <button type="button" className="btn btn-ghost h-8 text-xs" onClick={onRunDry} disabled={busy} data-testid="ops-run-dry">
          Run dry scrape{source ? ` (${source.org})` : ""}
        </button>
        <button type="button" className="btn btn-primary h-8 text-xs" onClick={onRunLive} disabled={busy} data-testid="ops-run-live">
          Run live scrape
        </button>
      </div>
      <div className="text-[11px] text-muted-foreground">Recent runs</div>
      <ul className="mt-1 space-y-1 text-xs">
        {runs.length === 0 ? <li className="text-muted-foreground">No runs yet.</li> : runs.slice(0, 5).map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 border-b border-border py-1 last:border-0">
            <span>{(r.at || "").slice(0, 19).replace("T", " ")}</span>
            <StatusBadge status={r.status} label={`${r.status} · ${r.items_new || 0} new`} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function QueueList({ items, selectedId, onSelect }) {
  if (!items.length) return <EmptyState title="Queue empty" description="Run a dry scrape to populate the queue." />;
  return (
    <section className="soft-card rounded-2xl p-3" data-testid="ops-queue-list">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Pending queue ({items.length})</div>
      <ul className="space-y-1 max-h-[60vh] overflow-y-auto">
        {items.map((q) => {
          const conf = Number(q.confidence_score ?? q.confidence ?? 0);
          const quality = typeof q.data_quality_score === "number" ? Math.round(Math.max(0, Math.min(1, q.data_quality_score)) * 100) : null;
          return (
            <li key={q.id}>
              <button type="button" onClick={() => onSelect(q.id)} className={`w-full text-left rounded-xl border px-3 py-2 text-xs ${selectedId === q.id ? "border-dusk-700 bg-dusk-700/10" : "border-border bg-white/60"}`} data-testid={`ops-queue-${q.id}`}>
                <div className="font-semibold truncate">{q.recruitment || q.extracted_data?.title || q.source_name || q.id}</div>
                <div className="text-[10px] text-muted-foreground">
                  conf {Math.round(conf * 100)}%{quality != null ? ` · quality ${quality}%` : ""}{(q.unverified_fields || []).length ? ` · ${q.unverified_fields.length} unverified` : ""}{q.official_source_resolved === false ? " · official unresolved" : ""}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RecruitmentList({ items, selectedId, onSelect }) {
  if (!items.length) return <EmptyState title="No recruitments" description="Promote a queue item to create a draft." />;
  return (
    <section className="soft-card rounded-2xl p-3" data-testid="ops-recruitment-list">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Recruitments ({items.length})</div>
      <ul className="space-y-1 max-h-[60vh] overflow-y-auto">
        {items.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => onSelect(r.id)} className={`w-full text-left rounded-xl border px-3 py-2 text-xs ${selectedId === r.id ? "border-dusk-700 bg-dusk-700/10" : "border-border bg-white/60"}`} data-testid={`ops-recruitment-${r.id}`}>
              <div className="font-semibold truncate">{r.name}</div>
              <div className="text-[10px] text-muted-foreground truncate">
                {r.publish_status} · {(r.blocking_issues || []).length} blockers
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EligibilityOpsLink() {
  return (
    <section className="soft-card rounded-2xl p-3" data-testid="ops-eligibility-link">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Eligibility Ops</div>
      <p className="text-xs text-muted-foreground">
        Downstream eligibility recompute and stale results live in the Eligibility Ops page.
      </p>
      <a className="btn btn-ghost h-8 text-xs mt-2" href="/admin/eligibility-ops">Open Eligibility Ops</a>
    </section>
  );
}
