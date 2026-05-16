import React from "react";
import {
  formatTime,
  lifecyclePill,
  openConflicts,
  reportPaneVariant,
  shortId,
  TIER_LABELS,
} from "./lifecycle";

function HeadMeta({ report }) {
  const tier = TIER_LABELS[report.criticality_tier] || TIER_LABELS.C_STANDARD_LONG_TAIL;
  const pill = lifecyclePill(report);
  return (
    <>
      <div className="head-meta">
        <span>report_id <strong>{report.id}</strong></span>
        {report.chain_root_id ? <span>chain_root <strong>{shortId(report.chain_root_id)}</strong></span> : null}
        <span>v<strong>{report.report_version || 1}</strong></span>
        <span>created {formatTime(report.created_at)}</span>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <span className={`badge ${tier.className}`}>{tier.long}</span>
        {report.exam_family_key ? (
          <span className="badge plain">exam_family {report.exam_family_key}</span>
        ) : null}
        <span className={pill.cls}>{pill.text}</span>
        <span className={`badge ${report.staleness_status && report.staleness_status !== "fresh" ? "pending" : "resolved"}`}>
          {report.staleness_status || "fresh"}
        </span>
      </div>
    </>
  );
}

function HeadActions({ report, busy, onRunResolver, onReject }) {
  return (
    <div className="head-actions">
      <button
        className="btn ghost small"
        disabled={busy || report.lifecycle_status === "rejected"}
        onClick={() => onReject?.(report)}
        data-testid="report-reject"
      >
        Reject report
      </button>
      <button
        className="btn small"
        disabled={busy}
        onClick={() => onRunResolver?.(report)}
        data-testid="report-run-resolver"
      >
        Re-run resolver
      </button>
    </div>
  );
}

function SuggestedProof({ report, busy, onConfirmSuggestedProof }) {
  const suggestions = report.suggested_official_urls || [];
  const confidence = report.official_resolution_confidence;
  return (
    <>
      <div className="current-action">
        <div>
          <div className="ca-label">Current blocker · suggested proof</div>
          <h3>Confirm suggested official proof</h3>
          <p>
            Resolver found {suggestions.length} likely official URL{suggestions.length === 1 ? "" : "s"}{" "}
            via <code>{report.official_resolution_method || "—"}</code>
            {confidence != null ? <> · confidence {Number(confidence).toFixed(2)}</> : null}.
          </p>
        </div>
      </div>

      <div className="proof-card suggested mb-3">
        <div className="pc-title">
          <h4>Official Proof</h4>
          <span className="badge pending">suggested</span>
        </div>
        <div className="pc-meta">
          <div>method · {report.official_resolution_method || "—"}</div>
          {confidence != null ? <div>confidence · {Number(confidence).toFixed(2)}</div> : null}
        </div>
        {suggestions.length === 0 ? (
          <div className="anno">No suggested URLs recorded. Re-run the resolver to retry.</div>
        ) : (
          <ul className="suggestion-list">
            {suggestions.map((s, idx) => (
              <li key={`${s.url}-${idx}`} className="suggestion-item">
                <div className="suggestion-url">{s.url}</div>
                <div className="tn">{s.method || "—"}{s.confidence != null ? ` · ${Number(s.confidence).toFixed(2)}` : ""}</div>
                <button
                  type="button"
                  className="btn small"
                  disabled={busy}
                  onClick={() => onConfirmSuggestedProof?.(report, s.url)}
                  data-testid={`confirm-proof-${idx}`}
                >
                  Confirm this URL
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function ConflictList({ conflicts, busy, onOpenOverride }) {
  return (
    <div className="card mb-3">
      <div className="card-header">
        <h3>Open conflicts</h3>
        <span className="tn">
          {conflicts.length} open · click a row to override
        </span>
      </div>
      <div className="card-body" style={{ padding: "0 16px" }}>
        {conflicts.map((c) => {
          const values = c.candidate_values || c.values || [];
          return (
            <div className="conflict-row" key={c.conflict_id || c.id} data-testid={`conflict-row-${c.conflict_id || c.id}`}>
              <div className="cf-head">
                <div>
                  <div className="cf-key">{c.conflict_key || c.field_path || "—"}</div>
                  <div className="cf-id">conflict_id · {c.conflict_id || c.id}</div>
                </div>
                <button
                  type="button"
                  className="btn small"
                  disabled={busy}
                  onClick={() => onOpenOverride?.(c)}
                  data-testid={`conflict-override-${c.conflict_id || c.id}`}
                >
                  Override
                </button>
              </div>
              <div className="cf-values">
                {values.length === 0 ? (
                  <div className="tn">No candidate values recorded.</div>
                ) : null}
                {values.map((v, idx) => {
                  const agg = (v.source_kind || "").toLowerCase().includes("aggregator");
                  return (
                    <div key={idx} className={`cf-val ${agg ? "aggregator" : "official"}`}>
                      <div className="cf-src">
                        {agg ? "aggregator" : "official"} · {v.source_url || "—"}
                      </div>
                      <div><strong>{v.value == null ? "—" : typeof v.value === "object" ? JSON.stringify(v.value) : String(v.value)}</strong></div>
                      {v.extracted_at ? (
                        <div className="tn" style={{ marginTop: 4 }}>extracted {formatTime(v.extracted_at)}</div>
                      ) : null}
                      {agg ? (
                        <div className="tn" style={{ marginTop: 4 }}>aggregator value cannot become canonical</div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ResolvedProofCard({ report }) {
  const url = (report.suggested_official_urls?.[0]?.url) || null;
  return (
    <div className="proof-card resolved mb-3">
      <div className="pc-title">
        <h4>Official Proof</h4>
        <span className="badge resolved">
          {report.official_resolution_status || "resolved"}
          {report.official_resolution_confidence != null
            ? ` · ${Number(report.official_resolution_confidence).toFixed(2)}`
            : ""}
        </span>
      </div>
      <div className="pc-meta">
        <div>method · {report.official_resolution_method || "—"}</div>
        <div>updated {formatTime(report.updated_at || report.created_at)}</div>
      </div>
      {url ? <div className="pc-evidence">{url}</div> : null}
    </div>
  );
}

export default function ReportPane({
  report,
  busy,
  onRunResolver,
  onReject,
  onPromote,
  onConfirmSuggestedProof,
  onOpenOverride,
  onOpenWorkflow,
}) {
  if (!report) {
    return (
      <div className="report-pane">
        <div className="anno">Select a report from the queue.</div>
      </div>
    );
  }
  const variant = reportPaneVariant(report);
  const conflicts = openConflicts(report);
  const promotable = report.recommended_action === "promote_eligible";

  return (
    <div className="report-pane" data-testid={`report-pane-${variant}`}>
      <div className="report-head">
        <div>
          <h2>{report.id}</h2>
          <HeadMeta report={report} />
        </div>
        <HeadActions report={report} busy={busy} onRunResolver={onRunResolver} onReject={onReject} />
      </div>

      {variant === "conflict" ? (
        <>
          <div className="current-action">
            <div>
              <div className="ca-label">Current blocker · {conflicts.length} conflict{conflicts.length === 1 ? "" : "s"}</div>
              <h3>Resolve consensus conflicts</h3>
              <p>Two or more sources disagree on a canonical field. Override the winner with reason + evidence to clear the gate.</p>
            </div>
            <div>
              <button
                className="btn primary"
                disabled={busy || conflicts.length === 0}
                onClick={() => onOpenOverride?.(conflicts[0])}
                data-testid="open-first-override"
              >
                Resolve first conflict
              </button>
            </div>
          </div>
          <ConflictList conflicts={conflicts} busy={busy} onOpenOverride={onOpenOverride} />
        </>
      ) : null}

      {variant === "suggested" ? (
        <SuggestedProof report={report} busy={busy} onConfirmSuggestedProof={onConfirmSuggestedProof} />
      ) : null}

      {variant === "resolved" ? (
        <>
          <div className="current-action">
            <div>
              <div className="ca-label">Recommended action</div>
              <h3>{(report.recommended_action || "review").replaceAll("_", " ")}</h3>
              <p>
                Gateway gate is open. Promote to push this report into the canonical promotion flow.
              </p>
            </div>
            <div>
              <button
                className="btn primary"
                disabled={busy || !promotable}
                onClick={() => onPromote?.(report)}
                data-testid="report-promote"
              >
                Promote
              </button>
            </div>
          </div>
          <ResolvedProofCard report={report} />
        </>
      ) : null}

      <button
        type="button"
        className="drawer-trigger"
        onClick={() => onOpenWorkflow?.(report)}
        data-testid="open-workflow-drawer"
      >
        <span>Workflow details · live timeline</span>
        <span className="arrow">→</span>
      </button>
    </div>
  );
}
