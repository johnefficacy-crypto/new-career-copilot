import React from "react";

// Renders the backend's bulk-dry-run response. Plan §6 contract:
//   { selected_ids, action, dry_run: true,
//     result: { eligible_count, blocked_count, blockers: [...] } }
export default function BulkActionPreview({ dryRun, onApply, disabled }) {
  if (!dryRun) return null;
  const { result, action } = dryRun;
  if (!result) return null;
  const hasEligible = (result.eligible_count || 0) > 0;
  const blockerGroups = groupBlockers(result.blockers || []);
  return (
    <section className="card" data-testid="bulk-action-preview">
      <div className="card-head-col">
        <div className="lbl">Bulk preview · dry run</div>
        <h3 className="oc-title">{action || "Bulk action"} · {dryRun.selected_ids?.length || result.eligible_count + result.blocked_count} items</h3>
        <div className="anno" style={{ marginTop: 2 }}>
          Apply will only act on eligible items. Blocked items remain unchanged with their reason_code intact.
        </div>
      </div>
      <div className="card-body stack">
        <div className="grid4">
          <div className="field big">
            <div className="field-lbl">selected</div>
            <div className="field-val">{(result.eligible_count || 0) + (result.blocked_count || 0)}</div>
          </div>
          <div className="field big good">
            <div className="field-lbl">eligible</div>
            <div className="field-val">{result.eligible_count || 0}</div>
          </div>
          <div className="field big bad">
            <div className="field-lbl">blocked</div>
            <div className="field-val">{result.blocked_count || 0}</div>
          </div>
          <div className="field big">
            <div className="field-lbl">action</div>
            <div className="field-val" style={{ fontSize: 14, fontFamily: "var(--fmono)" }}>{action}</div>
          </div>
        </div>
        {blockerGroups.length > 0 ? (
          <div>
            <div className="lbl" style={{ marginBottom: 6 }}>Blocked · grouped by reason_code</div>
            <div className="card">
              {blockerGroups.map((group) => (
                <div key={group.reason_code} className="blocker-grp">
                  <div className="bg-head" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div>
                      <div className="row-ttl">{group.reason_code}</div>
                      <div className="anno">{group.items.length} item{group.items.length === 1 ? "" : "s"}</div>
                    </div>
                  </div>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 11.5, color: "var(--ink-soft)" }}>
                    {group.items.slice(0, 6).map((b) => (
                      <li key={b.id}>{b.message || b.id}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className="card-foot">
        <button type="button" className="btn primary small" onClick={onApply} disabled={disabled || !hasEligible}>
          Apply to {result.eligible_count || 0} eligible
        </button>
      </div>
    </section>
  );
}

function groupBlockers(list) {
  const map = new Map();
  for (const item of list) {
    const code = item.reason_code || "unknown";
    if (!map.has(code)) map.set(code, { reason_code: code, items: [] });
    map.get(code).items.push(item);
  }
  return Array.from(map.values());
}
