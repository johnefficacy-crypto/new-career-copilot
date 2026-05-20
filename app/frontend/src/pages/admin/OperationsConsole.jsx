import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, getApiUnverifiedFields } from "../../lib/api";
import useAdminAction from "../../features/admin/shared/useAdminAction";
import AdminProgressBar, { computeProgress } from "../../features/admin/workflow/AdminProgressBar";
import CurrentActionCard from "../../features/admin/workflow/CurrentActionCard";
import AdminFixPanel from "../../features/admin/workflow/AdminFixPanel";
import DuplicateMergePreview from "../../features/admin/workflow/DuplicateMergePreview";
import SelectionContextBanner from "../../features/admin/workflow/SelectionContextBanner";
import useConflicts from "../../features/admin/workflow/useConflicts";
import { scoreToPct } from "../../features/admin/workflow/scoreUtils";
import { useToast } from "../../shared/ui";
import { Drawer } from "../../shared/ui/studyos";

const VIEWS = [
  { id: "source", label: "Setup & run" },
  { id: "queue", label: "Review & publish" },
];

// Filter ``key`` matches scrape_queue.status verbatim so the backend can do
// the filtering; ``approved`` is the storage value for a row that has been
// promoted into a recruitment draft. The label is always "Promoted" because
// "approved" leaks an internal state name and was confusable with publish.
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
  if ((item?.open_conflicts || 0) > 0) {
    return { cls: "badge blocker", text: "conflict" };
  }
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
  const [mergeTarget, setMergeTarget] = useState(null);
  const [conflictTarget, setConflictTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [queueFilter, setQueueFilter] = useState(() => searchParams.get("queue_status") || "pending");
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [leftView, setLeftView] = useState(() => (recruitmentId ? "drafts" : "candidates"));
  // Heavy per-item detail (extracted_data / raw_extracted_item / raw_html)
  // is stripped from the lightweight queue list; we hydrate it on demand
  // when an item is selected so the resolver can auto-detect host
  // candidates and the field-review panels have data to render.
  const [queueDetail, setQueueDetail] = useState(null);
  // Bumped at the end of every loadAll so the detail hydration effect
  // re-runs after a reload (e.g. post-resolve, post-field-correction).
  const [reloadNonce, setReloadNonce] = useState(0);

  const { conflicts, refetch: refetchConflicts } = useConflicts(queueId);

  const { runAction, busyKey, error: actionError } = useAdminAction();
  const toast = useToast();

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
      setReloadNonce((n) => n + 1);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Detail hydration: fetch the full row for the selected queue item via
  // the include_detail path and stash the heavy fields. Re-runs when the
  // selection changes or after any loadAll (reloadNonce). Failure is
  // non-fatal — the resolver falls back to manual add.
  const hydrateQueueDetail = useCallback(async (id) => {
    if (!id) { setQueueDetail(null); return; }
    try {
      const r = await api.get(
        `/api/admin/scrape/queue?status=all&include_detail=true&item_id=${encodeURIComponent(id)}&limit=1`,
      );
      const full = (r.items || [])[0] || null;
      if (full && full.id === id) {
        setQueueDetail({
          id: full.id,
          extracted_data: full.extracted_data ?? null,
          raw_extracted_item: full.raw_extracted_item ?? full.extracted_data ?? null,
          raw_html: full.raw_html ?? null,
          raw_payload: full.raw_payload ?? null,
        });
      }
    } catch {
      // Keep list-level fields; the resolver shows the manual-add path.
    }
  }, []);

  useEffect(() => { hydrateQueueDetail(queueId); }, [queueId, reloadNonce, hydrateQueueDetail]);

  // Keep the segmented selector in sync with URL-driven selection. Opening
  // a recruitment via deep link should switch the rail to "drafts"; clearing
  // it should fall back to "candidates" unless the admin manually toggled.
  useEffect(() => {
    if (recruitmentId) setLeftView("drafts");
    else if (!queueId) setLeftView("candidates");
  }, [recruitmentId, queueId]);

  const selectedSource = useMemo(
    () => sources.find((s) => s.id === sourceId) || null,
    [sources, sourceId],
  );
  const selectedQueueItem = useMemo(() => {
    const base = queue.find((q) => q.id === queueId) || null;
    if (!base) return null;
    if (queueDetail && queueDetail.id === base.id) {
      // Overlay ONLY the heavy content fields. List-level gate/status
      // fields (official_source_resolved, unverified_fields, promotable…)
      // come from the freshest loadAll so a stale detail snapshot can't
      // revert the gate after a resolve. ``??`` keeps the list value when
      // present and falls back to the hydrated detail otherwise.
      return {
        ...base,
        extracted_data: base.extracted_data ?? queueDetail.extracted_data,
        raw_extracted_item: base.raw_extracted_item ?? queueDetail.raw_extracted_item,
        raw_html: base.raw_html ?? queueDetail.raw_html,
        raw_payload: base.raw_payload ?? queueDetail.raw_payload,
      };
    }
    return base;
  }, [queue, queueId, queueDetail]);

  // P0-2 fallback: selection is URL-param driven and survives loadAll by
  // re-finding the id in the fresh list. If the selected item vanished
  // (rejected/merged out of view, or dropped past the page limit), clear
  // the param and tell the admin rather than leaving an empty workspace.
  useEffect(() => {
    if (loading) return;
    if (queueId && !selectedQueueItem) {
      toast.info("That candidate is no longer in the queue. Selection cleared.");
      updateParams({ queue_id: null });
    }
  }, [loading, queueId, selectedQueueItem, toast, updateParams]);
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
    conflicts,
  }), [selectedSource, latestRun, selectedQueueItem, selectedRecruitment, validateResult, conflicts]);

  const onStepClick = useCallback((stepId) => {
    const setupSteps = new Set(["source_ready", "dry_scrape", "live_scrape"]);
    updateParams({ mode: setupSteps.has(stepId) ? "source" : "queue" });
  }, [updateParams]);

  // CurrentActionCard primary button: focus the matching AdminFixPanel
  // section and scroll it into view. Setup-phase kinds switch to the
  // setup view; everything else lives in the queue/review workspace.
  const onPrimaryAction = useCallback((kind) => {
    const setupKinds = new Set(["source_ready", "dry_scrape", "live_scrape"]);
    if (setupKinds.has(kind)) {
      updateParams({ mode: "source" });
      return;
    }
    if (mode !== "queue") updateParams({ mode: "queue" });
    const anchorByKind = {
      attach_official_source: "official-source-quick-resolver",
      verify_fields: "queue-fix-section",
      resolve_conflicts: "fix-panel-conflicts",
      promote_to_draft: "promote-bar",
    };
    const testid = anchorByKind[kind] || "ops-workspace";
    // Defer one frame so a view switch has a chance to render the panel.
    const scroll = () => {
      if (typeof document === "undefined") return;
      const el = document.querySelector(`[data-testid="${testid}"]`)
        || document.querySelector('[data-testid="ops-workspace"]');
      el?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(scroll);
    else scroll();
  }, [mode, updateParams]);

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

  const rejectCandidate = useCallback((item) => {
    if (!item?.id) return;
    setRejectReason("");
    setRejectTarget(item);
  }, []);

  const confirmReject = useCallback(async () => {
    if (!rejectTarget?.id) return;
    const trimmed = (rejectReason || "").trim();
    if (!trimmed) { setMsg("Reject cancelled — reason is required."); return; }
    const target = rejectTarget;
    await runAction({
      key: `reject-${target.id}`,
      successMessage: "Candidate rejected.",
      action: async () => {
        await api.post(`/api/admin/scrape/items/${target.id}/reject`, { notes: trimmed });
        setRejectTarget(null);
        setRejectReason("");
        await loadAll();
      },
    });
  }, [rejectTarget, rejectReason, runAction, loadAll]);

  const resolveConflict = useCallback(async (payload) => {
    const conflictId = payload?.conflict_id || conflictTarget?.id;
    if (!conflictId) return;
    await runAction({
      key: `resolve-conflict-${conflictId}`,
      successMessage: "Conflict resolved. Promotion gate updated.",
      action: async () => {
        await api.post(`/api/admin/conflicts/${conflictId}/resolve`, {
          value: payload?.value,
          scope: payload?.scope,
          reason: payload?.reason,
          evidence_url: payload?.evidence_url,
        });
        setConflictTarget(null);
        await refetchConflicts();
        await loadAll();
      },
    });
  }, [conflictTarget, runAction, refetchConflicts, loadAll]);

  const rejectConflict = useCallback(async (conflictId, body) => {
    if (!conflictId) return;
    await runAction({
      key: `reject-conflict-${conflictId}`,
      successMessage: "Conflict rejected.",
      action: async () => {
        await api.post(`/api/admin/conflicts/${conflictId}/reject`, {
          reason: body?.reason || "rejected by admin",
        });
        setConflictTarget(null);
        await refetchConflicts();
        await loadAll();
      },
    });
  }, [runAction, refetchConflicts, loadAll]);

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
          <div className="err-row">Failed to load Operations · {loadError.message}</div>
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
            queueFilter={queueFilter}
            onQueueFilter={(value) => { setQueueFilter(value); updateParams({ queue_status: value === "pending" ? null : value }); }}
            onSelectQueue={(id) => updateParams({ queue_id: id, recruitment_id: null })}
            onSelectRecruitment={(id) => updateParams({ recruitment_id: id, queue_id: null })}
            leftView={leftView}
            onLeftView={setLeftView}
            workflowOpen={workflowOpen}
            onOpenWorkflow={() => setWorkflowOpen(true)}
            onCloseWorkflow={() => setWorkflowOpen(false)}
            onPrimaryAction={onPrimaryAction}
            onClearSource={() => updateParams({ source_id: null })}
            onClearQueue={() => updateParams({ queue_id: null })}
            onClearRecruitment={() => updateParams({ recruitment_id: null })}
            onStepClick={onStepClick}
            onQueueFieldAction={queueFieldAction}
            onPromote={promote}
            onMergeIntoExisting={openMergePreview}
            onMarkDuplicate={markDuplicate}
            onRejectCandidate={rejectCandidate}
            onValidate={validate}
            onVerify={verify}
            onPublish={publish}
            mergeTarget={mergeTarget}
            onCloseMerge={() => setMergeTarget(null)}
            onSourcesChanged={loadAll}
            onConfirmMerge={confirmMerge}
            conflicts={conflicts}
            conflictTarget={conflictTarget}
            onOpenConflict={setConflictTarget}
            onResolveConflict={resolveConflict}
            onRejectConflict={rejectConflict}
            onCloseConflict={() => setConflictTarget(null)}
            busy={Boolean(busyKey)}
            msg={msg}
            actionError={actionError}
          />
        )}
      </div>
      <RejectCandidateDialog
        open={Boolean(rejectTarget)}
        item={rejectTarget}
        reason={rejectReason}
        onReasonChange={setRejectReason}
        onCancel={() => { setRejectTarget(null); setRejectReason(""); }}
        onConfirm={confirmReject}
        busy={Boolean(busyKey)}
      />
    </div>
  );
}

function RejectCandidateDialog({ open, item, reason, onReasonChange, onCancel, onConfirm, busy }) {
  if (!open || !item) return null;
  const title = item.recruitment || item.id;
  const trimmed = (reason || "").trim();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ops-reject-title"
      data-testid="ops-reject-dialog"
    >
      <div className="absolute inset-0" onClick={onCancel} />
      <div className="card" style={{ position: "relative", maxWidth: 460, width: "90%" }}>
        <div className="card-head-col">
          <div className="lbl">Reject candidate</div>
          <h3 id="ops-reject-title" className="oc-title" style={{ fontSize: 17 }}>{title}</h3>
        </div>
        <div className="card-body stack">
          <div className="anno">A reason is required. It is recorded in the audit log.</div>
          <textarea
            className="input"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="Why is this candidate being rejected?"
            data-testid="ops-reject-reason"
            autoFocus
            style={{ minHeight: 90 }}
          />
        </div>
        <div className="card-foot">
          <button type="button" className="btn ghost small" onClick={onCancel} disabled={busy}>Cancel</button>
          <button
            type="button"
            className="btn primary small"
            onClick={onConfirm}
            disabled={busy || !trimmed}
            data-testid="ops-reject-confirm"
          >
            {busy ? "Rejecting…" : "Reject candidate"}
          </button>
        </div>
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
  progressState, selectedSource, selectedQueueItem, selectedRecruitment,
  queue, queueId, recruitmentId, recruitments, sources, validateResult,
  queueFilter, onQueueFilter, onSelectQueue, onSelectRecruitment,
  onClearSource, onClearQueue, onClearRecruitment,
  onStepClick, onQueueFieldAction,
  onPromote, onMergeIntoExisting, onMarkDuplicate, onRejectCandidate,
  onValidate, onVerify, onPublish,
  mergeTarget, onCloseMerge,
  onSourcesChanged, onConfirmMerge,
  conflicts, conflictTarget, onOpenConflict, onResolveConflict, onRejectConflict, onCloseConflict,
  busy, msg, actionError,
  leftView, onLeftView, workflowOpen, onOpenWorkflow, onCloseWorkflow, onPrimaryAction,
}) {
  const progress = computeProgress(progressState);
  return (
    <>
      <section className="scrn" style={{ padding: "0 0 18px", border: "none" }}>
        <div className="scrn-head">
          <h3 className="oc-title">Review pipeline state</h3>
          <span className="scrn-tag">current action + selection context</span>
        </div>
        <div className="stack">
          <CurrentActionCard progress={progress} onOpenDetails={onOpenWorkflow} onPrimaryAction={onPrimaryAction} />
          <SelectionContextBanner
            source={selectedSource}
            queueItem={selectedQueueItem}
            recruitment={selectedRecruitment}
            onClearSource={onClearSource}
            onClearQueue={onClearQueue}
            onClearRecruitment={onClearRecruitment}
          />
          {msg ? <div className="warn-row" data-testid="ops-msg">{msg}</div> : null}
          {actionError ? <div className="err-row">{actionError.message}</div> : null}
        </div>
      </section>

      <Drawer
        open={workflowOpen}
        onClose={onCloseWorkflow}
        title="Workflow details"
        width={640}
      >
        <AdminProgressBar state={progressState} onStepClick={onStepClick} />
      </Drawer>

      <section className="scrn" style={{ borderTop: "1px solid var(--rule)" }}>
        <div className="scrn-head">
          <h3 className="oc-title">Workspace</h3>
          <span className="scrn-tag">queue · fix panel</span>
        </div>
        <div className="grid" style={{ display: "grid", gridTemplateColumns: "minmax(280px, 340px) 1fr", gap: 16 }}>
          <div className="stack" data-testid="ops-left-column">
            <div
              className="oc-segmented"
              role="tablist"
              aria-label="Left rail selection"
              data-testid="ops-left-segmented"
            >
              <button
                type="button"
                role="tab"
                aria-selected={leftView === "candidates"}
                className={`oc-segmented__option${leftView === "candidates" ? " active" : ""}`}
                onClick={() => onLeftView("candidates")}
                data-testid="ops-left-tab-candidates"
              >
                Candidates
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={leftView === "drafts"}
                className={`oc-segmented__option${leftView === "drafts" ? " active" : ""}`}
                onClick={() => onLeftView("drafts")}
                data-testid="ops-left-tab-drafts"
              >
                Drafts
              </button>
            </div>

            {leftView === "candidates" ? (
              <div className="card" data-testid="ops-left-candidates">
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
            ) : (
              <div data-testid="ops-left-drafts">
                <RecruitmentList items={recruitments} selectedId={recruitmentId} onSelect={onSelectRecruitment} />
              </div>
            )}
          </div>

          <div className="stack" data-testid="ops-workspace">
            <AdminFixPanel
              queueItem={selectedQueueItem}
              recruitment={selectedRecruitment}
              validateResult={validateResult}
              sources={sources}
              conflicts={conflicts}
              conflictTarget={conflictTarget}
              onQueueFieldAction={onQueueFieldAction}
              onPromote={onPromote}
              onMergeIntoExisting={onMergeIntoExisting}
              onMarkDuplicate={onMarkDuplicate}
              onRejectCandidate={onRejectCandidate}
              onValidate={onValidate}
              onVerify={onVerify}
              onPublish={onPublish}
              onSourcesChanged={onSourcesChanged}
              onOpenConflict={onOpenConflict}
              onResolveConflict={onResolveConflict}
              onRejectConflict={onRejectConflict}
              onCloseConflict={onCloseConflict}
              busy={busy}
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
  if (!items.length) {
    return (
      <section className="card">
        <div className="card-body">
          <div className="empty"><div className="empty-title">No drafts</div>No recruitment drafts yet.</div>
        </div>
      </section>
    );
  }
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
