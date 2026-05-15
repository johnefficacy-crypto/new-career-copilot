import React, { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { api } from "../../../lib/api";

export default function PublishImpactPanel({ recruitmentId, open = true, onPublish }) {
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
  const recruitmentName = data?.recruitment_name || data?.name || "Selected recruitment";

  return (
    <section className="card" data-testid="publish-impact-panel">
      <div className="card-head-col">
        <div className="lbl">What publish will trigger</div>
        <h3 className="oc-title">{recruitmentName}</h3>
        <div className="anno" style={{ marginTop: 2 }}>
          Count-only preview. Publish fans out eligibility recompute to every onboarded profile and enables alerts.
        </div>
      </div>
      <div className="card-body stack">
        {error ? <div className="err-row">Preview failed · {error.message}</div> : null}
        {!data && loading ? <div className="skel" style={{ height: 80 }} /> : null}
        {data ? (
          <>
            <div className="grid3">
              <div className="field big">
                <div className="field-lbl">onboarded users</div>
                <div className="field-val">{userBase.onboarded_count ?? 0}</div>
                <div className="field-sub">{noUsers ? "publish fans out to zero" : "recomputes will be enqueued"}</div>
              </div>
              <div className={`field big${userBase.missing_dob_count ? " warn" : ""}`}>
                <div className="field-lbl">missing dob</div>
                <div className="field-val">{userBase.missing_dob_count ?? 0}</div>
                <div className="field-sub">{userBase.missing_dob_count ? "conditional verdicts" : "all profiles complete"}</div>
              </div>
              <div className="field big">
                <div className="field-lbl">alerts queued</div>
                <div className="field-val">{data?.notifications?.queued_for_this_recruitment ?? 0}</div>
                <div className="field-sub">for this recruitment</div>
              </div>
            </div>

            {verdicts.has_prior_results ? (
              <div>
                <div className="lbl" style={{ marginBottom: 6 }}>Current verdicts · last recompute</div>
                <div className="grid3">
                  <div className="field good">
                    <div className="field-lbl">eligible</div>
                    <div className="field-val">{verdicts.eligible ?? 0}</div>
                  </div>
                  <div className="field warn">
                    <div className="field-lbl">conditional</div>
                    <div className="field-val">{verdicts.conditional ?? 0}</div>
                  </div>
                  <div className="field">
                    <div className="field-lbl">ineligible</div>
                    <div className="field-val">{verdicts.ineligible ?? 0}</div>
                  </div>
                </div>
                <div className="anno" style={{ marginTop: 6 }}>Sampled from first 10,000 eligibility_results rows.</div>
              </div>
            ) : (
              <div className="anno">No prior eligibility results. Counts populate after the first recompute completes.</div>
            )}

            <div className="row" style={{ background: "var(--paper-sunk)", border: "1px solid var(--rule)", borderRadius: 3, padding: "10px 12px" }}>
              <div style={{ flex: 1 }}>
                <div className="lbl" style={{ marginBottom: 3 }}>deadline</div>
                <div style={{ fontSize: 13 }}>
                  {deadline?.apply_end_date ? (
                    <>
                      <strong>{deadline.apply_end_date}</strong>
                      {deadlineDays != null ? (
                        <span className={tightDeadline ? "anno anno-arrow" : "anno"} style={{ color: tightDeadline ? "var(--blocker)" : "var(--ink-mute)", marginLeft: 6 }}>
                          · {deadlineDays} day{deadlineDays === 1 ? "" : "s"} away
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="anno">no apply_end_date</span>
                  )}
                </div>
              </div>
              {tightDeadline ? <span className="impact-pill bad">deadline tight</span> : null}
              {noUsers ? <span className="impact-pill warn">no onboarded users</span> : null}
            </div>
          </>
        ) : null}
      </div>
      <div className="card-foot">
        <button type="button" className="btn ghost small" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
        </button>
        {onPublish ? <button type="button" className="btn primary small" onClick={onPublish}>Confirm &amp; publish</button> : null}
      </div>
    </section>
  );
}
