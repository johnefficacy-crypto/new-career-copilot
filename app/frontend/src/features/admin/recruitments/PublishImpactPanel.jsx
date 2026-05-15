import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Bell, CalendarClock, Loader2, RefreshCw, UserCheck } from "lucide-react";
import { api } from "../../../lib/api";

// Renders GET /api/admin/recruitments/{id}/publish-impact as a compact
// preview the admin can read before clicking Publish. Counts only — does
// not run the engine. Surfaces:
//   - user base fan-out (how many recompute rows the trigger will create)
//   - current verdicts split (eligible / conditional / ineligible) if this
//     recruitment has prior eligibility_results rows
//   - profile-completeness proxy (missing dob)
//   - notifications already queued
//   - days to deadline

function Metric({ icon: Icon, label, value, tone, sub }) {
  const toneClass = tone === "warn" ? "text-amber-700" : tone === "bad" ? "text-destructive" : "";
  return (
    <div className="rounded-xl border border-border bg-white/70 p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        {Icon ? <Icon className="h-3 w-3" aria-hidden="true" /> : null}
        {label}
      </div>
      <div className={`mt-1 font-heading text-xl ${toneClass}`}>{value ?? 0}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export default function PublishImpactPanel({ recruitmentId, open = true }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!recruitmentId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.get(`/api/admin/recruitments/${recruitmentId}/publish-impact`);
      setData(r);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [recruitmentId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  if (!open) return null;

  const userBase = data?.user_base || {};
  const verdicts = data?.current_verdicts || {};
  const deadline = data?.deadline || {};
  const deadlineDays = deadline?.days_to_deadline;
  const tightDeadline = deadlineDays != null && deadlineDays <= 3;
  const noUsers = (userBase.onboarded_count ?? 0) === 0;

  return (
    <section className="soft-card rounded-2xl p-4" data-testid="publish-impact-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Publish impact preview</div>
          <h3 className="font-heading text-lg">What publish will trigger</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Count-only preview. Publishing fans out an eligibility recompute to every onboarded profile and enables alerts.
          </p>
        </div>
        <button type="button" className="btn btn-ghost h-8 text-xs" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
        </button>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-destructive/30 bg-white/70 p-3 text-xs text-destructive">
          Preview failed: {error.message}
        </div>
      ) : null}

      {!data && loading ? (
        <div className="mt-3 text-xs text-muted-foreground">Loading impact…</div>
      ) : null}

      {data ? (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <Metric
              icon={UserCheck}
              label="Onboarded users"
              value={userBase.onboarded_count}
              tone={noUsers ? "warn" : undefined}
              sub={noUsers ? "No onboarded users — publishing fans out to zero." : `~${userBase.onboarded_count} recomputes will be enqueued`}
            />
            <Metric
              label="Missing DOB"
              value={userBase.missing_dob_count}
              tone={userBase.missing_dob_count ? "warn" : undefined}
              sub={userBase.missing_dob_count ? "These users will get conditional verdicts." : "All onboarded users have a DOB."}
            />
            <Metric
              icon={Bell}
              label="Alerts queued"
              value={data?.notifications?.queued_for_this_recruitment}
              sub="For this recruitment"
            />
          </div>

          {verdicts.has_prior_results ? (
            <div className="mt-3">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Current verdicts (from last recompute)</div>
              <div className="mt-1 grid gap-2 sm:grid-cols-3">
                <Metric label="Eligible" value={verdicts.eligible} />
                <Metric label="Conditional" value={verdicts.conditional} tone={verdicts.conditional ? "warn" : undefined} />
                <Metric label="Ineligible" value={verdicts.ineligible} />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Sampled from the first 10,000 eligibility_results rows for this recruitment.
              </p>
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-border bg-white/60 p-2 text-[11px] text-muted-foreground">
              No prior eligibility results for this recruitment. Counts will appear after the first recompute completes.
            </div>
          )}

          <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-white/70 p-2 text-xs">
            <CalendarClock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div>
              Deadline:{" "}
              {deadline?.apply_end_date ? (
                <>
                  <b>{deadline.apply_end_date}</b>
                  {deadlineDays != null ? <span className={tightDeadline ? "ml-2 font-semibold text-destructive" : "ml-2 text-muted-foreground"}>· {deadlineDays} day{deadlineDays === 1 ? "" : "s"} away</span> : null}
                </>
              ) : (
                <span className="text-muted-foreground">no apply_end_date</span>
              )}
            </div>
          </div>

          {(noUsers || tightDeadline) ? (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                {noUsers ? <div>No onboarded users yet — publishing today will not reach anyone.</div> : null}
                {tightDeadline ? <div>Deadline is within 3 days. Confirm the date before publishing.</div> : null}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
