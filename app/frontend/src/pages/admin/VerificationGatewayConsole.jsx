import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import "./VerificationGatewayConsole.css";
import { useToast } from "../../shared/ui";
import useAdminAction from "../../features/admin/shared/useAdminAction";
import useVerificationReports from "../../features/admin/verification-gateway/useVerificationReports";
import useVerificationReport from "../../features/admin/verification-gateway/useVerificationReport";
import useReverificationBatches from "../../features/admin/verification-gateway/useReverificationBatches";
import QueueItem from "../../features/admin/verification-gateway/QueueItem";
import ReportPane from "../../features/admin/verification-gateway/ReportPane";
import OverrideConflictModal from "../../features/admin/verification-gateway/OverrideConflictModal";
import BulkActionModal from "../../features/admin/verification-gateway/BulkActionModal";
import BatchAlertBanner from "../../features/admin/verification-gateway/BatchAlertBanner";
import { verificationReportsService } from "../../services/verificationReportsService";

// Recruitment Verification Gateway — Admin Console (production wiring).
//
// Single Review-and-Publish surface. Six prototype "demo screens" from
// the original 1:1 React port collapsed into a dynamic report pane
// whose variant follows the report row's lifecycle_status +
// recommended_action. Hardcoded data removed; everything reads from
// /api/admin/verification-reports and friends.
//
// Routing: /admin/verification-gateway?report_id=<uuid>&filter=<key>
// keeps the selected report + queue filter in the URL so refreshes /
// links survive.

const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT,WONK@9..144,300..900,0..100,0..1&family=IBM+Plex+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap";

function useGoogleFonts() {
  useEffect(() => {
    if (document.querySelector(`link[data-vgc-fonts]`)) return undefined;
    const preconnect1 = document.createElement("link");
    preconnect1.rel = "preconnect";
    preconnect1.href = "https://fonts.googleapis.com";
    preconnect1.setAttribute("data-vgc-fonts", "preconnect1");
    document.head.appendChild(preconnect1);
    const preconnect2 = document.createElement("link");
    preconnect2.rel = "preconnect";
    preconnect2.href = "https://fonts.gstatic.com";
    preconnect2.crossOrigin = "";
    preconnect2.setAttribute("data-vgc-fonts", "preconnect2");
    document.head.appendChild(preconnect2);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONTS_HREF;
    link.setAttribute("data-vgc-fonts", "stylesheet");
    document.head.appendChild(link);
    return () => {};
  }, []);
}

const QUEUE_FILTERS = [
  { key: "all", label: "all", params: {} },
  { key: "tier_a", label: "tier a", params: { tier: "A_HIGH_STAKES" } },
  { key: "tier_b", label: "tier b", params: { tier: "B_TECHNICAL_CONDITIONAL" } },
  { key: "tier_c", label: "tier c", params: { tier: "C_STANDARD_LONG_TAIL" } },
  { key: "blockers", label: "blockers", params: { recommended_action: "await_official_proof" } },
  { key: "conflicts", label: "conflicts", params: { lifecycle: "conflict" } },
  { key: "consensus", label: "consensus pending", params: { lifecycle: "consensus_pending" } },
  { key: "stale", label: "stale", params: { lifecycle: "stale_source_changed" } },
  { key: "complexity", label: "complexity", params: { lifecycle: "complexity_detected" } },
  { key: "needs_reverification", label: "reverify", params: { lifecycle: "needs_reverification" } },
];

export default function VerificationGatewayConsole() {
  useGoogleFonts();
  const [searchParams, setSearchParams] = useSearchParams();
  const reportId = searchParams.get("report_id") || null;
  const filterKey = searchParams.get("filter") || "all";

  const filter = useMemo(
    () => QUEUE_FILTERS.find((f) => f.key === filterKey) || QUEUE_FILTERS[0],
    [filterKey],
  );

  // Reports list — stable filter params object so the hook doesn't loop.
  const listParams = useMemo(() => ({ ...filter.params, limit: 100 }), [filter]);
  const { items: reports, loading: listLoading, error: listError, refetch: refetchList } =
    useVerificationReports(listParams);

  // Selected report — separate fetch so we have full jsonb columns
  // (suggested_official_urls, conflicts, risk_flags) for the pane.
  const { report: selectedReport, refetch: refetchReport } = useVerificationReport(reportId);

  // Batches — banner + ack button.
  const { items: batches, refetch: refetchBatches } = useReverificationBatches({ acknowledged: false });

  const { runAction, busyKey } = useAdminAction();
  const toast = useToast();
  const busy = Boolean(busyKey);

  const [overrideTarget, setOverrideTarget] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState("bulk_promote");
  const [selectedIds, setSelectedIds] = useState(new Set());

  const updateParams = useCallback((next) => {
    const merged = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([k, v]) => {
      if (v == null || v === "") merged.delete(k);
      else merged.set(k, String(v));
    });
    setSearchParams(merged, { replace: false });
  }, [searchParams, setSearchParams]);

  const onSelectReport = useCallback((report) => {
    updateParams({ report_id: report?.id || null });
  }, [updateParams]);

  const onSelectFilter = useCallback((key) => {
    updateParams({ filter: key === "all" ? null : key });
  }, [updateParams]);

  const onToggleCheck = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const refetchAll = useCallback(async () => {
    await Promise.all([refetchList(), refetchReport(), refetchBatches()]);
  }, [refetchList, refetchReport, refetchBatches]);

  // ── Mutations ────────────────────────────────────────────────────────

  const onRunResolver = useCallback(async (report) => {
    if (!report?.id) return;
    await runAction({
      key: `run-resolver-${report.id}`,
      successMessage: "Resolver re-run dispatched.",
      action: async () => {
        await verificationReportsService.runResolver(report.id);
        await refetchAll();
      },
    });
  }, [runAction, refetchAll]);

  const onReject = useCallback(async (report) => {
    if (!report?.id) return;
    const reason = window.prompt("Reject reason (optional)") || "";
    await runAction({
      key: `reject-${report.id}`,
      successMessage: "Report rejected.",
      action: async () => {
        await verificationReportsService.reject(report.id, reason ? { reason } : {});
        await refetchAll();
      },
    });
  }, [runAction, refetchAll]);

  const onPromote = useCallback(async (report) => {
    if (!report?.id) return;
    await runAction({
      key: `promote-${report.id}`,
      successMessage: "Report promoted through gateway gate.",
      action: async () => {
        try {
          await verificationReportsService.promote(report.id);
          await refetchAll();
        } catch (e) {
          // 409 from gateway gate carries a useful reason_code; surface
          // it on the toast so the admin sees the gate name.
          const detail = e?.detail;
          if (detail && typeof detail === "object" && detail.message) {
            toast.error(`Gate blocked · ${detail.reason_code || "unknown"} · ${detail.message}`);
          }
          throw e;
        }
      },
    });
  }, [runAction, refetchAll, toast]);

  const onConfirmSuggestedProof = useCallback(async (report, chosenUrl) => {
    if (!report?.id || !chosenUrl) return;
    await runAction({
      key: `confirm-proof-${report.id}`,
      successMessage: "Official proof attached.",
      action: async () => {
        await verificationReportsService.confirmSuggestedProof(report.id, { chosen_url: chosenUrl });
        await refetchAll();
      },
    });
  }, [runAction, refetchAll]);

  const onOpenOverride = useCallback((conflict) => {
    setOverrideTarget(conflict || null);
  }, []);

  const onApplyOverride = useCallback(async (payload) => {
    if (!selectedReport?.id || !payload?.conflict_id) return;
    await runAction({
      key: `override-${payload.conflict_id}`,
      successMessage: "Conflict resolved by admin override.",
      action: async () => {
        await verificationReportsService.overrideConflict(selectedReport.id, payload);
        setOverrideTarget(null);
        await refetchAll();
      },
    });
  }, [selectedReport, runAction, refetchAll]);

  const onAcknowledgeBatch = useCallback(async (batchId) => {
    if (!batchId) return;
    await runAction({
      key: `ack-batch-${batchId}`,
      successMessage: "Batch acknowledged. Pending reports released in chunks.",
      action: async () => {
        await verificationReportsService.acknowledgeBatch(batchId);
        await refetchBatches();
        await refetchList();
      },
    });
  }, [runAction, refetchBatches, refetchList]);

  const onBulkApplied = useCallback(async (result) => {
    const applied = result?.applied_ids?.length || 0;
    const blocked = result?.blocked_count || 0;
    toast.success(`Bulk ${result?.action || ""} · ${applied} applied · ${blocked} blocked.`);
    setBulkOpen(false);
    clearSelection();
    await refetchAll();
  }, [toast, clearSelection, refetchAll]);

  const openBulk = (action) => {
    if (selectedIds.size === 0) {
      toast.error("Select at least one report first.");
      return;
    }
    setBulkAction(action);
    setBulkOpen(true);
  };

  // ── Render ───────────────────────────────────────────────────────────

  const filterCounts = useMemo(() => {
    // Tiny per-filter count; computed in-memory off the current page.
    // The total endpoint is paginated, so this is an at-a-glance hint
    // rather than an authoritative number.
    return {
      total: reports.length,
      blockers: reports.filter((r) => r.recommended_action === "await_official_proof" || r.recommended_action === "block_publish").length,
      conflicts: reports.filter((r) => r.lifecycle_status === "conflict" || r.lifecycle_status === "admin_override_required").length,
    };
  }, [reports]);

  const selectedCount = selectedIds.size;
  const overrideBusy = Boolean(busyKey && String(busyKey).startsWith("override-"));
  const ackBusy = Boolean(busyKey && String(busyKey).startsWith("ack-batch-"));

  return (
    <div className="vgc-root">
      <header className="masthead">
        <div>
          <div className="deck">Recruitment Verification Gateway</div>
          <h1>Review &amp; Publish</h1>
        </div>
        <div className="admin-meta">
          <span className="tn">
            {filterCounts.total} report{filterCounts.total === 1 ? "" : "s"} on this page ·{" "}
            {filterCounts.conflicts} conflict{filterCounts.conflicts === 1 ? "" : "s"} ·{" "}
            {filterCounts.blockers} blocker{filterCounts.blockers === 1 ? "" : "s"}
          </span>
        </div>
      </header>

      {batches.length > 0 ? (
        <BatchAlertBanner
          batches={batches}
          busy={ackBusy}
          onAcknowledge={onAcknowledgeBatch}
        />
      ) : null}

      <section className="screen active" id="screen-review">
        <div className="section-header">
          <h2>Active reports</h2>
          <div className="row" style={{ gap: 8 }}>
            <span className="tn">
              {selectedCount > 0 ? `${selectedCount} selected` : "select rows to enable bulk action"}
            </span>
            <button
              type="button"
              className="btn small"
              disabled={busy || selectedCount === 0}
              onClick={() => openBulk("bulk_promote")}
              data-testid="open-bulk-promote"
            >
              Bulk promote
            </button>
            <button
              type="button"
              className="btn ghost small"
              disabled={busy || selectedCount === 0}
              onClick={() => openBulk("bulk_reject")}
              data-testid="open-bulk-reject"
            >
              Bulk reject
            </button>
          </div>
        </div>

        <div className="review-layout">
          <aside className="queue-list" data-testid="vgc-queue-list">
            <div className="queue-filter">
              {QUEUE_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={filterKey === f.key ? "active" : ""}
                  onClick={() => onSelectFilter(f.key)}
                  data-testid={`vgc-filter-${f.key}`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {listError ? (
              <div className="tn" style={{ padding: 12, color: "var(--danger, #b00)" }} role="alert">
                Failed to load reports · {listError.message || "network error"}
              </div>
            ) : null}

            {listLoading && reports.length === 0 ? (
              <div className="anno" style={{ padding: 12 }}>Loading reports…</div>
            ) : null}

            {!listLoading && reports.length === 0 ? (
              <div className="anno" style={{ padding: 12 }} data-testid="vgc-empty">
                No reports match this filter.
              </div>
            ) : null}

            {reports.map((r) => (
              <QueueItem
                key={r.id}
                report={r}
                selected={r.id === reportId}
                onSelect={onSelectReport}
                showCheckbox
                checked={selectedIds.has(r.id)}
                onToggleCheck={onToggleCheck}
              />
            ))}
          </aside>

          <ReportPane
            report={selectedReport}
            busy={busy}
            onRunResolver={onRunResolver}
            onReject={onReject}
            onPromote={onPromote}
            onConfirmSuggestedProof={onConfirmSuggestedProof}
            onOpenOverride={onOpenOverride}
          />
        </div>
      </section>

      <OverrideConflictModal
        open={Boolean(overrideTarget)}
        conflict={overrideTarget}
        busy={overrideBusy}
        onClose={() => setOverrideTarget(null)}
        onSubmit={onApplyOverride}
      />

      <BulkActionModal
        open={bulkOpen}
        action={bulkAction}
        selectedIds={Array.from(selectedIds)}
        onClose={() => setBulkOpen(false)}
        onApplied={onBulkApplied}
        busy={busy}
      />
    </div>
  );
}
