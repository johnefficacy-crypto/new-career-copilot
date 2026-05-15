import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function AdminEligibilityOps() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [failedRows, setFailedRows] = useState([]);
  const [retryingId, setRetryingId] = useState(null);

  async function load() {
    setError(null);
    try {
      const r = await api.get("/api/admin/eligibility-ops");
      setData(r);
      setFailedRows(r.failed_rows || []);
    } catch (e) {
      setError(e);
    }
  }

  useEffect(() => { load(); }, []);

  async function retry(id) {
    setRetryingId(id);
    try {
      await api.post(`/api/admin/eligibility-ops/retry/${id}`, {});
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setRetryingId(null);
    }
  }

  if (!data && !error) {
    return (
      <div className="stack">
        <div className="skel" style={{ height: 40 }} />
        <div className="skel" style={{ height: 160 }} />
      </div>
    );
  }

  return (
    <div className="stack" data-testid="admin-eligibility-ops">
      <section className="scrn" style={{ padding: 0, border: "none" }}>
        <div className="scrn-head">
          <div>
            <div className="lbl">Operations · eligibility recompute</div>
            <h2 className="oc-title disp" style={{ fontSize: 22, marginTop: 4 }}>Recompute queue status</h2>
            <div className="anno" style={{ marginTop: 4 }}>
              Failed rows can be retried individually. Manual fan-out enqueues a fresh recompute for every onboarded user.
            </div>
          </div>
          <span className="scrn-tag">per recruitment · retry failed rows</span>
        </div>

        {error ? <div className="err-row">{error.message}</div> : null}

        <div className="card">
          <div className="card-body stack">
            <div className="row">
              <span className="impact-pill"><span className="lbl">pending</span><strong>{data?.pending_recomputes ?? 0}</strong></span>
              <span className="impact-pill"><span className="lbl">queued</span><strong>{data?.queued ?? 0}</strong></span>
              <span className="impact-pill warn"><span className="lbl">processing</span><strong>{data?.processing ?? 0}</strong></span>
              <span className="impact-pill bad"><span className="lbl">failed</span><strong>{data?.failed_recomputes ?? 0}</strong></span>
              <span className="impact-pill ok"><span className="lbl">processed</span><strong>{data?.processed ?? 0}</strong></span>
              <span style={{ marginLeft: "auto" }} className="anno">stale results · {data?.stale_results ?? 0}</span>
            </div>

            {failedRows.length ? (
              <div className="card">
                {failedRows.slice(0, 25).map((row) => (
                  <div key={row.id} style={{ padding: "10px 12px", borderBottom: "1px solid var(--rule-soft)" }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row">
                          <span className="badge blocker">failed</span>
                          <span className="mono" style={{ fontSize: 11 }}>{String(row.id).slice(0, 10)}</span>
                          <span className="anno">user {String(row.user_id || "").slice(0, 8)} · attempts: {row.attempts ?? 0}</span>
                        </div>
                        {row.error_message ? <div className="err-row" style={{ marginTop: 6 }}>{row.error_message}</div> : null}
                        <div className="anno" style={{ marginTop: 4 }}>
                          queued {(row.queued_at || "").slice(11, 16)} · {row.reason || "—"}
                        </div>
                      </div>
                      <button type="button" className="btn small" onClick={() => retry(row.id)} disabled={retryingId === row.id}>
                        {retryingId === row.id ? "Retrying…" : "Retry"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {(data?.failed_recomputes ?? 0) > 3 ? (
              <div className="warn-row">⚠ {data.failed_recomputes} failed recomputes. Inspect worker logs before retrying in bulk.</div>
            ) : null}
          </div>
          <div className="card-foot">
            <button type="button" className="btn ghost small" onClick={load}>Refresh</button>
            <button type="button" className="btn primary small" disabled>
              Recompute now · {data?.onboarded_users || 0} users
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
