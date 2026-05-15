import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, getApiUnverifiedFields } from "../../lib/api";
import useAdminAction from "../../features/admin/shared/useAdminAction";
import AdminProgressBar from "../../features/admin/workflow/AdminProgressBar";
import AdminActionChecklist from "../../features/admin/workflow/AdminActionChecklist";
import AdminFixPanel from "../../features/admin/workflow/AdminFixPanel";
import useAdminNextActions from "../../features/admin/workflow/useAdminNextActions";
import OfficialSourceResolver from "../../features/admin/workflow/OfficialSourceResolver";
import DuplicateMergePreview from "../../features/admin/workflow/DuplicateMergePreview";
import SelectionContextBanner from "../../features/admin/workflow/SelectionContextBanner";
import { scoreToPct } from "../../features/admin/workflow/scoreUtils";

const VIEWS = [
  { id: "source", label: "Setup & run" },
  { id: "queue", label: "Review & publish" },
];

const QUEUE_FILTERS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Promoted" },
  { key: "merged", label: "Merged" },
  { key: "duplicate", label: "Duplicate" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

function tierForItem(item) {
  const tier = (item?.source_tier || "").toUpperCase();
  if (tier === "A" || tier === "B" || tier === "C") return tier;
  const kind = (item?.source_type || item?.source_kind || "").toLowerCase();
  if (kind === "aggregator") return "C";
  if (kind === "institutional") return "B";
  return "A";
}

function itemBadge(item) {
  const status = (item?.status || "pending").toLowerCase();
  if (status === "approved") return { cls: "badge resolved", text: "resolved" };
  if (status === "rejected") return { cls: "badge neutral", text: "rejected" };
  if (status === "duplicate") return { cls: "badge neutral", text: "duplicate" };
  if (status === "merged") return { cls: "badge info", text: "merged" };
  if (item?.unverified_fields?.length || item?.official_source_resolved === false) {
    return { cls: "badge blocker", text: "unresolved" };
  }
  if ((item?.duplicate_candidates || []).length) return { cls: "badge blocker", text: "conflict" };
  return { cls: "badge pending", text: "suggested" };
}

export default function OperationsConsole() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sourceId = searchParams.get("source_id") || null;
  const queueId = searchParams.get("queue_id") || null;
  const recruitmentId = searchParams.get("recruitment_id") || null;
  const mode = searchParams.get("mode") || "queue";

  const [sources, setSources] = useState([]);
  const [runs, setRuns] = useState([]);
  const [queue, setQueue] = useState([]);
  const [recruitments, setRecruitments] = useState([]);
  const [validateResult, setValidateResult] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [resolverOpen, setResolverOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState(null);
  const [queueFilter, setQueueFilter] = useState(() => searchParams.get("queue_status") || "pending");

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
        api.get("/api/admin/scrape/queue?status=all&limit=50"),
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
  const nextAction = useMemo(
    () => checklistItems.find((i) => i.status === "blocked")
       || checklistItems.find((i) => i.status === "todo")
       || null,
    [checklistItems],
  );

  const onStepClick = useCallback((stepId) => {
    const setupSteps = new Set(["source_ready", "dry_scrape", "live_scrape"]);
    updateParams({ mode: setupSteps.has(stepId) ? "source" : "queue" });
  }, [updateParams]);

  const onJumpToChecklistTarget = useCallback((target) => {
    if (!target) return;
    const setupTargets = new Set(["source-list", "run-controls"]);
    if (setupTargets.has(target)) updateParams({ mode: "source" });
    else updateParams({ mode: "queue" });
  }, [updateParams]);

  const queueFieldAction = useCallback(async (id, field, action, correctedValue, scope) => {
    await runAction({
      key: `field-${id}-${field}-${action}-${scope?.entity_key || ""}`,
      successMessage: `${field} ${action} saved.`,
      action: async () => {
        await api.post(`/api/admin/scrape/items/${id}/fields/${field}/${action}`, {
          notes: scope?.notes || "operations console",
          corrected_value: correctedValue,
          entity_type: scope?.entity_type || null,
          entity_key: scope?.entity_key || null,
        });
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
          updateParams({ recruitment_id: r.recruitment_id, mode: "queue" });
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

  const openMergePreview = useCallback((_item, dup) => {
    const targetId = dup?.recruitment_id || dup?.id;
    if (!targetId) return;
    setMergeTarget({ id: targetId, name: dup.name || dup.title || targetId });
  }, []);

  const confirmMerge = useCallback(async ({ force_fields }) => {
    if (!queueId || !mergeTarget?.id) return;
    await runAction({
      key: `merge-${queueId}-${mergeTarget.id}`,
      successMessage: "Merged into existing recruitment.",
      action: async () => {
        await api.post(`/api/admin/scrape/items/${queueId}/merge-into/${mergeTarget.id}`, { force_fields });
        setMergeTarget(null);
        await loadAll();
      },
    });
  }, [queueId, mergeTarget, runAction, loadAll]);

  const markDuplicate = useCallback(async (item, dup) => {
    const targetId = dup?.recruitment_id || dup?.id;
    if (!targetId) return;
    await runAction({
      key: `mark-dup-${item.id}`,
      confirm: `Mark "${item.recruitment || item.id}" as duplicate of "${dup.name || targetId}"?`,
      successMessage: "Marked as duplicate.",
      action: async () => {
        await api.post(`/api/admin/scrape/items/${item.id}/mark-duplicate`, { notes: `duplicate of ${targetId}` });
        await loadAll();
      },
    });
  }, [runAction, loadAll]);

  const resolveOfficialSource = useCallback(async (payload) => {
    if (!queueId) return;
    await runAction({
      key: `resolve-official-${queueId}`,
      successMessage: "Official source resolved. Promotion gate flipped open.",
      action: async () => {
        await api.post(`/api/admin/scrape/items/${queueId}/resolve-official-source`, payload);
        setResolverOpen(false);
        await loadAll();
      },
    });
  }, [queueId, runAction, loadAll]);

  const runScrape = useCallback(async (modeArg) => {
    const key = modeArg === "dry" ? "scrape-dry" : "scrape-live";
    await runAction({
      key,
      confirm: modeArg === "dry" ? null : "Run live scrape now? Live scrape only queues candidates; it does not publish.",
      successMessage: modeArg === "dry" ? "Dry scrape complete." : "Live scrape complete.",
      action: async () => {
        const body = sourceId ? { source_ids: [sourceId], limit: 25 } : { limit: 25 };
        await api.post(modeArg === "dry" ? "/api/admin/scrape/run-dry" : "/api/admin/scrape/run", body);
        await loadAll();
      },
    });
  }, [runAction, loadAll, sourceId]);

  if (loading && !sources.length && !queue.length) {
    return (
      <div className="stack">
        <div className="skel" style={{ height: 90 }} />
        <div className="skel" style={{ height: 180 }} />
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="err-row">Failed to load Operations Console · {loadError.message}</div>
          <div style={{ marginTop: 10 }}>
            <button className="btn small" onClick={loadAll}>Retry</button>
          </div>
        </div>
      </div>
    );
  }

  const pendingCount = queue.filter((q) => (q.status || "pending") === "pending").length;
  const totalSources = sources.length;

  return (
    <div data-testid="admin-operations-console">
      <nav className="modebar" style={{ margin: "-18px -22px 0", padding: "0 22px" }}>
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            className={`modepill${mode === v.id ? " active" : ""}`}
            onClick={() => updateParams({ mode: v.id })}
            data-testid={`ops-mode-${v.id}`}
          >
            {v.label}{" "}
            <span className="count">{v.id === "source" ? `${totalSources} src` : pendingCount}</span>
          </button>
        ))}
      </nav>

      <div className="scrn" style={{ borderTop: "none", paddingLeft: 0, paddingRight: 0 }}>
        {mode === "source" ? (
          <SetupAndRun
            sources={sources}
            selectedSource={selectedSource}
            runs={runs}
            queue={queue}
            onSelectSource={(id) => updateParams({ source_id: id })}
            onRunDry={() => runScrape("dry")}
            onRunLive={() => runScrape("live")}
            busy={Boolean(busyKey)}
          />
        ) : (
          <ReviewAndPublish
            checklistItems={checklistItems}
            progressState={progressState}
            selectedSource={selectedSource}
            selectedQueueItem={selectedQueueItem}
            selectedRecruitment={selectedRecruitment}
            queue={queue}
            queueId={queueId}
            recruitmentId={recruitmentId}
            recruitments={recruitments}
            sources={sources}
            validateResult={validateResult}
            nextAction={nextAction}
            queueFilter={queueFilter}
            onQueueFilter={(value) => { setQueueFilter(value); updateParams({ queue_status: value === "pending" ? null : value }); }}
            onSelectQueue={(id) => updateParams({ queue_id: id })}
            onSelectRecruitment={(id) => updateParams({ recruitment_id: id })}
            onClearSource={() => updateParams({ source_id: null })}
            onClearQueue={() => updateParams({ queue_id: null })}
            onClearRecruitment={() => updateParams({ recruitment_id: null })}
            onStepClick={onStepClick}
            onJumpToChecklistTarget={onJumpToChecklistTarget}
            onQueueFieldAction={queueFieldAction}
            onPromote={promote}
            onMergeIntoExisting={openMergePreview}
            onMarkDuplicate={markDuplicate}
            onValidate={validate}
            onVerify={verify}
            onPublish={publish}
            onOpenOfficialSourceResolver={() => setResolverOpen(true)}
            resolverOpen={resolverOpen}
            mergeTarget={mergeTarget}
            onCloseResolver={() => setResolverOpen(false)}
            onCloseMerge={() => setMergeTarget(null)}
            onResolveOfficialSource={resolveOfficialSource}
            onConfirmMerge={confirmMerge}
            busy={Boolean(busyKey)}
            msg={msg}
            actionError={actionError}
          />
        )}
      </div>
    </div>
  );
}

function SetupAndRun({ sources, selectedSource, runs, queue, onSelectSource, onRunDry, onRunLive, busy }) {
  const latestRun = runs[0] || null;
  const tierA = queue.filter((q) => tierForItem(q) === "A").length;
  const tierB = queue.filter((q) => tierForItem(q) === "B").length;
  const tierC = queue.filter((q) => tierForItem(q) === "C").length;
  const sourceType = selectedSource?.source_type || selectedSource?.kind || "official";
  const trustBadge = selectedSource?.is_verified
    ? { cls: "badge resolved", text: "verified" }
    : selectedSource ? { cls: "badge pending", text: "unverified" } : null;
  const isAggregator = sourceType === "aggregator";

  return (
    <section className="scrn" style={{ padding: "0 0 18px", border: "none" }}>
      <div className="scrn-head">
        <h3 className="oc-title">Setup &amp; run</h3>
        <span className="scrn-tag">mode · setup</span>
      </div>
      <div className="stack">
        <div className="card">
          <div className="card-head">
            <h4 className="oc-title">Source</h4>
            {trustBadge ? <span className={trustBadge.cls}>{trustBadge.text}</span> : <span className="badge neutral">no selection</span>}
          </div>
          <div className="card-body stack">
            <div>
              <div className="lbl" style={{ marginBottom: 5 }}>Pick verified source</div>
              <select className="input" value={selectedSource?.id || ""} onChange={(e) => onSelectSource(e.target.value || null)} data-testid="setup-source-select">
                <option value="">Select a source…</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>{s.org || s.source_name} · {s.source_type || s.kind || "official"}</option>
                ))}
              </select>
            </div>
            {selectedSource ? (
              <div className="row">
                <span className="lbl">trust</span>
                <span className={trustBadge.cls}>{trustBadge.text}</span>
                <span className="lbl" style={{ marginLeft: 10 }}>policy</span>
                <span className="badge neutral">{isAggregator ? "discovery only" : "official"}</span>
              </div>
            ) : null}
            <div className="anno">
              {isAggregator
                ? "Aggregator data discovers candidates only. Cannot become canonical until paired with official proof."
                : "Verified official sources can become canonical proof. Promotion requires verified required fields."}
            </div>
          </div>
          <div className="card-foot">
            <button type="button" className="btn small" onClick={onRunDry} disabled={busy} data-testid="ops-run-dry">Dry scrape</button>
            <button type="button" className="btn primary small" onClick={onRunLive} disabled={busy} data-testid="ops-run-live">Run live scrape</button>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h4 className="oc-title">Last run</h4>
            <span className="row-sub">{latestRun ? `${(latestRun.id || "").slice(0, 8)} · ${(latestRun.at || "").slice(11, 16) || "—"}` : "no runs yet"}</span>
          </div>
          <div className="card-body">
            <div className="grid2">
              <div className="field">
                <div className="field-lbl">extracted</div>
                <div className="field-val"><strong>{latestRun?.items_total ?? latestRun?.items_extracted ?? 0}</strong> items</div>
              </div>
              <div className="field">
                <div className="field-lbl">classified</div>
                <div className="field-val"><strong>{latestRun?.items_total ?? 0}</strong></div>
                <div className="field-sub">A·{tierA} · B·{tierB} · C·{tierC}</div>
              </div>
              <div className="field">
                <div className="field-lbl">queued</div>
                <div className="field-val"><strong>{latestRun?.items_new ?? 0}</strong></div>
                <div className="field-sub">{latestRun?.items_duplicate ?? 0} duplicate · hash match</div>
              </div>
              <div className="field">
                <div className="field-lbl">duration</div>
                <div className="field-val"><strong>{latestRun?.duration_human || "—"}</strong></div>
                <div className="field-sub">{latestRun?.duration_per_item_human || "—"} / item</div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h4 className="oc-title">Recent runs</h4>
            <a className="btn ghost small" href="/admin/scraper">Open scrape monitor</a>
          </div>
          {runs.length === 0 ? (
            <div className="card-body"><div className="anno">No runs yet.</div></div>
          ) : (
            <table className="t">
              <thead>
                <tr>
                  <th style={{ width: "42%" }}>Source</th>
                  <th style={{ width: "20%" }}>Tier</th>
                  <th style={{ width: "14%" }}>Items</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {runs.slice(0, 6).map((r) => {
                  const tier = (r.source_tier || "A").toUpperCase();
                  const statusCls = r.status === "completed" ? "badge resolved" : r.status === "failed" ? "badge blocker" : r.status === "running" ? "badge pending" : "badge info";
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="row-ttl">{r.source_name || r.source || "—"}</div>
                        <div className="row-sub">{(r.id || "").slice(0, 8)} · {(r.at || "").slice(11, 16)}</div>
                      </td>
                      <td><span className={`badge tier-${tier.toLowerCase()}`}>{tier} · {r.items_total || 0}</span></td>
                      <td className="num">{r.items_total || 0}</td>
                      <td><span className={statusCls}>{r.status || "—"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}

function ReviewAndPublish({
  checklistItems, progressState, selectedSource, selectedQueueItem, selectedRecruitment,
  queue, queueId, recruitmentId, recruitments, sources, validateResult, nextAction,
  queueFilter, onQueueFilter, onSelectQueue, onSelectRecruitment,
  onClearSource, onClearQueue, onClearRecruitment,
  onStepClick, onJumpToChecklistTarget, onQueueFieldAction,
  onPromote, onMergeIntoExisting, onMarkDuplicate,
  onValidate, onVerify, onPublish, onOpenOfficialSourceResolver,
  resolverOpen, mergeTarget, onCloseResolver, onCloseMerge,
  onResolveOfficialSource, onConfirmMerge, busy, msg, actionError,
}) {
  const calloutTitle = nextAction?.label || "Pick a workflow target";
  const calloutMessage = nextAction?.reason || nextAction?.hint || "Select a queue item or recruitment to start working.";
  const calloutTone = checklistItems.some((i) => i.status === "blocked") ? "warn" : "info";

  return (
    <>
      <section className="scrn" style={{ padding: "0 0 18px", border: "none" }}>
        <div className="scrn-head">
          <h3 className="oc-title">Review pipeline state</h3>
          <span className="scrn-tag">progress + context + next action</span>
        </div>
        <div className="stack">
          <AdminProgressBar state={progressState} onStepClick={onStepClick} />
          <SelectionContextBanner
            source={selectedSource}
            queueItem={selectedQueueItem}
            recruitment={selectedRecruitment}
            onClearSource={onClearSource}
            onClearQueue={onClearQueue}
            onClearRecruitment={onClearRecruitment}
          />
          <div className={`next-action${calloutTone === "warn" ? " warn" : ""}`}>
            <div>
              <div className="lbl" style={{ marginBottom: 5 }}>Next safe action</div>
              <h4 className="oc-title" style={{ color: "var(--paper)" }}>{calloutTitle}</h4>
              <div style={{ fontSize: 12, color: "rgba(250,247,242,0.85)", marginTop: 4 }}>{calloutMessage}</div>
            </div>
            {nextAction?.target ? (
              <button type="button" className="btn primary" onClick={() => onJumpToChecklistTarget(nextAction.target)}>Open fix panel</button>
            ) : null}
          </div>
          {msg ? <div className="warn-row" data-testid="ops-msg">{msg}</div> : null}
          {actionError ? <div className="err-row">{actionError.message}</div> : null}
        </div>
      </section>

      <section className="scrn" style={{ borderTop: "1px solid var(--rule)" }}>
        <div className="scrn-head">
          <h3 className="oc-title">Left rail · workspace</h3>
          <span className="scrn-tag">checklist + queue · fix panel</span>
        </div>
        <div className="grid" style={{ display: "grid", gridTemplateColumns: "minmax(280px, 340px) 1fr", gap: 16 }}>
          <div className="stack" data-testid="ops-left-column">
            <AdminActionChecklist items={checklistItems} onJump={onJumpToChecklistTarget} />

            <div className="card">
              <div className="filter-bar">
                {QUEUE_FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className={`filter${queueFilter === f.key ? " active" : ""}`}
                    onClick={() => onQueueFilter(f.key)}
                    data-testid={`queue-filter-${f.key}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <QueueList items={queue} filter={queueFilter} selectedId={queueId} onSelect={onSelectQueue} />
            </div>

            <RecruitmentList items={recruitments} selectedId={recruitmentId} onSelect={onSelectRecruitment} />
          </div>

          <div className="stack" data-testid="ops-workspace">
            <AdminFixPanel
              queueItem={selectedQueueItem}
              recruitment={selectedRecruitment}
              validateResult={validateResult}
              sources={sources}
              nextAction={nextAction}
              onJumpToTarget={onJumpToChecklistTarget}
              onQueueFieldAction={onQueueFieldAction}
              onPromote={onPromote}
              onMergeIntoExisting={onMergeIntoExisting}
              onMarkDuplicate={onMarkDuplicate}
              onValidate={onValidate}
              onVerify={onVerify}
              onPublish={onPublish}
              onOpenOfficialSourceResolver={onOpenOfficialSourceResolver}
              busy={busy}
            />
            <OfficialSourceResolver
              open={resolverOpen && Boolean(selectedQueueItem)}
              sources={sources}
              queueItem={selectedQueueItem}
              busy={busy}
              onClose={onCloseResolver}
              onSubmit={onResolveOfficialSource}
            />
            <DuplicateMergePreview
              open={Boolean(mergeTarget && queueId)}
              queueId={queueId}
              recruitment={mergeTarget}
              busy={busy}
              onClose={onCloseMerge}
              onConfirmMerge={onConfirmMerge}
            />
          </div>
        </div>
      </section>
    </>
  );
}

function QueueList({ items, filter, selectedId, onSelect }) {
  const filtered = filter === "all" ? items : items.filter((q) => (q.status || "pending") === filter);
  if (filtered.length === 0) {
    return <div className="empty"><div className="empty-title">No queue items</div>No items in this view.</div>;
  }
  return (
    <div className="qlist" style={{ maxHeight: "60vh", overflowY: "auto" }}>
      {filtered.map((q) => {
        const conf = scoreToPct(q.confidence_score ?? q.confidence);
        const quality = scoreToPct(q.data_quality_score);
        const tier = tierForItem(q);
        const status = itemBadge(q);
        const title = q.recruitment || q.extracted_data?.title || q.source_name || q.id;
        const action = q.status === "approved" ? "→ already promoted"
          : status.text === "unresolved" ? "→ resolve official source"
          : status.text === "conflict" ? "→ resolve conflict"
          : status.text === "suggested" ? "→ confirm suggested proof"
          : "→ review";
        return (
          <button
            key={q.id}
            type="button"
            className={`qitem${selectedId === q.id ? " selected" : ""}`}
            onClick={() => onSelect(q.id)}
            data-testid={`ops-queue-${q.id}`}
          >
            <div className="row" style={{ gap: 5 }}>
              <span className={`badge tier-${tier.toLowerCase()}`}>{tier}</span>
              <span className={status.cls}>{status.text}</span>
            </div>
            <div className="qttl">{title}</div>
            <div className="qsub">
              {q.source_name || q.source || "—"}
              {conf != null ? ` · conf ${(conf / 100).toFixed(2)}` : ""}
              {quality != null ? ` · quality ${quality}%` : ""}
            </div>
            <div className="qaction">{action}</div>
          </button>
        );
      })}
    </div>
  );
}

function RecruitmentList({ items, selectedId, onSelect }) {
  if (!items.length) return null;
  return (
    <section className="card">
      <div className="card-head">
        <h4 className="oc-title">Recruitments</h4>
        <span className="row-sub">{items.length}</span>
      </div>
      <div className="qlist" style={{ maxHeight: "40vh", overflowY: "auto" }}>
        {items.map((r) => (
          <button
            key={r.id}
            type="button"
            className={`qitem${selectedId === r.id ? " selected" : ""}`}
            onClick={() => onSelect(r.id)}
            data-testid={`ops-recruitment-${r.id}`}
          >
            <div className="qttl">{r.name}</div>
            <div className="qsub">
              {r.publish_status || "draft"} · {(r.blocking_issues || []).length} blocker{(r.blocking_issues || []).length === 1 ? "" : "s"}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
