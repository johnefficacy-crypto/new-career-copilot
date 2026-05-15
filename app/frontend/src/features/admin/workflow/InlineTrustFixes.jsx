import React, { useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldCheck, Building2, Loader2 } from "lucide-react";
import { adminTrustService } from "../../../services/adminTrustService";

// Inline alternative to the "Open Organizations / Open Sources" page jump
// for the two most common publish blockers. The recruitment drawer already
// knows the organization_id and source_id; this component just lets the
// reviewer click Verify here and see the trust evaluator's response —
// checks/warnings/errors — without leaving the drawer.

const SOURCE_BLOCKER_CODES = new Set([
  "unverified_source_provenance",
  "source_provenance_not_found",
]);
const ORG_BLOCKER_CODES = new Set([
  "organization_unverified",
]);

function ResultBox({ result }) {
  if (!result) return null;
  if (result.error) {
    return (
      <div className="mt-2 rounded-lg border border-destructive/30 bg-white/70 p-2 text-xs text-destructive">
        Verify failed: {result.error}
      </div>
    );
  }
  const checks = result.checks || {};
  const warnings = result.warnings || [];
  const errors = result.errors || [];
  return (
    <div className="mt-2 space-y-1 rounded-lg border border-border bg-white/70 p-2 text-[11px]">
      {Object.keys(checks).length ? (
        <div>
          <span className="font-semibold">Checks:</span>{" "}
          {Object.entries(checks).map(([k, v]) => (
            <span key={k} className="ml-2 inline-flex items-center gap-1">
              {v === true ? <CheckCircle2 className="h-3 w-3 text-sage-700" /> : <AlertTriangle className="h-3 w-3 text-amber-700" />}
              {k}
            </span>
          ))}
        </div>
      ) : null}
      {warnings.length ? <div className="text-amber-800"><span className="font-semibold">Warnings:</span> {warnings.join(", ")}</div> : null}
      {errors.length ? <div className="text-destructive"><span className="font-semibold">Errors:</span> {errors.join(", ")}</div> : null}
      {!Object.keys(checks).length && !warnings.length && !errors.length ? (
        <div className="text-muted-foreground">No detail returned — refresh to see updated state.</div>
      ) : null}
    </div>
  );
}

function FixCard({ icon: Icon, title, description, busy, disabled, disabledReason, onClick, result, dataTestId }) {
  return (
    <div className="rounded-xl border border-border bg-white/80 p-3" data-testid={dataTestId}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm">{title}</div>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          {disabled && disabledReason ? (
            <div className="mt-2 text-[11px] text-amber-800">{disabledReason}</div>
          ) : null}
        </div>
        <button
          type="button"
          className="btn btn-primary h-8 text-xs"
          disabled={busy || disabled}
          onClick={onClick}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Verify"}
        </button>
      </div>
      <ResultBox result={result} />
    </div>
  );
}

export default function InlineTrustFixes({ row, blockers = [], onAfterFix }) {
  const [sourceBusy, setSourceBusy] = useState(false);
  const [orgBusy, setOrgBusy] = useState(false);
  const [sourceResult, setSourceResult] = useState(null);
  const [orgResult, setOrgResult] = useState(null);

  const blockerCodes = new Set(blockers || []);
  const showSource = [...SOURCE_BLOCKER_CODES].some((c) => blockerCodes.has(c));
  const showOrg = [...ORG_BLOCKER_CODES].some((c) => blockerCodes.has(c));

  if (!showSource && !showOrg) return null;

  const verifySource = async () => {
    if (!row?.source_id) {
      setSourceResult({ error: "No source linked to this recruitment. Link one in the edit panel first." });
      return;
    }
    setSourceBusy(true);
    setSourceResult(null);
    try {
      const r = await adminTrustService.verifySource(row.source_id);
      setSourceResult(r);
      onAfterFix?.();
    } catch (e) {
      setSourceResult({ error: e?.message || "Verify failed" });
    } finally {
      setSourceBusy(false);
    }
  };

  const verifyOrg = async () => {
    if (!row?.organization_id) {
      setOrgResult({ error: "No organization linked to this recruitment. Link one in the edit panel first." });
      return;
    }
    setOrgBusy(true);
    setOrgResult(null);
    try {
      const r = await adminTrustService.verifyOrganization(row.organization_id);
      setOrgResult(r);
      onAfterFix?.();
    } catch (e) {
      setOrgResult({ error: e?.message || "Verify failed" });
    } finally {
      setOrgBusy(false);
    }
  };

  return (
    <section className="soft-card rounded-2xl p-4" data-testid="inline-trust-fixes">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Inline trust fixes</div>
          <h3 className="font-heading text-lg">Resolve trust blockers without leaving this drawer</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Runs the same backend trust evaluator a full-page verify action would.
            Full source / organization management is still available from the
            registry pages.
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {showSource ? (
          <FixCard
            icon={ShieldCheck}
            title="Verify linked source"
            description={row?.source_id ? `Source: ${row.source_provenance || row.source_id}` : "No source linked yet."}
            busy={sourceBusy}
            disabled={!row?.source_id}
            disabledReason={!row?.source_id ? "Link a source first via the edit panel." : null}
            onClick={verifySource}
            result={sourceResult}
            dataTestId="verify-source-inline"
          />
        ) : null}
        {showOrg ? (
          <FixCard
            icon={Building2}
            title="Verify linked organization"
            description={row?.organization_id ? `Organization: ${row.organization || row.organization_id}` : "No organization linked yet."}
            busy={orgBusy}
            disabled={!row?.organization_id}
            disabledReason={!row?.organization_id ? "Link an organization first via the edit panel." : null}
            onClick={verifyOrg}
            result={orgResult}
            dataTestId="verify-organization-inline"
          />
        ) : null}
      </div>
    </section>
  );
}
