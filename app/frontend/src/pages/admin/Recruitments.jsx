import React, { useEffect, useMemo, useState } from "react";
import RecruitmentEditPanel from "../../features/admin/recruitments/RecruitmentEditPanel";
import RecruitmentTrustActions from "../../features/admin/recruitments/RecruitmentTrustActions";
import useAdminAction from "../../features/admin/shared/useAdminAction";
import { api } from "../../lib/api";
import { AdminTable, EmptyState, ErrorState, LoadingSkeleton, StatusBadge } from "../../shared/ui";

export default function AdminRecruitments() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { runAction, busyKey, error: actionError } = useAdminAction();

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const d = await api.get("/api/admin/recruitments");
      setItems(d.items || []);
    } catch (e) { setError(e); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const act = async (id, a, opts = {}) => runAction({ key: `${a}-${id}`, confirm: opts.confirm, successMessage: `${a} completed`, errorMessage: `${a} failed`, action: async () => { await api.post(`/api/admin/recruitments/${id}/${a}`, {}); await load(); } });

  const save = async (id, payload) => runAction({ key: `save-${id}`, successMessage: "Recruitment saved", errorMessage: "Save failed", action: async () => { await api.put(`/api/admin/recruitments/${id}`, payload || {}); await load(); } });

  const summary = useMemo(() => ({ unpublished: items.filter((i) => i.publish_status !== "published").length, blocked: items.filter((i) => (i.blocking_issues || []).length > 0).length }), [items]);

  const columns = [
    { key: "name", header: "Recruitment", render: (r) => <div><div className="font-medium">{r.name}</div><div className="text-muted-foreground text-xs">{r.organization}</div></div> },
    { key: "publish_status", header: "Publish", render: (r) => <StatusBadge status={r.publish_status} label={r.publish_status} /> },
    { key: "lifecycle_status", header: "Lifecycle", render: (r) => <StatusBadge status={r.lifecycle_status} label={r.lifecycle_status} /> },
    { key: "organization_verified", header: "Org verified", render: (r) => <StatusBadge status={r.organization_verified ? "verified" : "pending"} label={r.organization_verified ? "Verified" : "Pending"} /> },
    { key: "official_notification_url", header: "Notification", render: (r) => r.official_notification_url || "—" },
    { key: "official_apply_url", header: "Apply", render: (r) => r.official_apply_url || "—" },
    { key: "source_provenance", header: "Provenance", render: (r) => r.source_provenance || "—" },
    { key: "blocking_issues", header: "Blocking issues", render: (r) => (r.blocking_issues || []).join(", ") || "—" },
    { key: "warnings", header: "Warnings", render: (r) => (r.warnings || []).join(", ") || "—" },
    { key: "published", header: "Published", render: (r) => <div>{r.published_by || "—"}<div className="text-xs text-muted-foreground">{r.published_at || ""}</div></div> },
    { key: "review_notes", header: "Review notes", render: (r) => <div className="space-y-2"><div>{r.review_notes || "—"}</div><RecruitmentEditPanel row={r} onSave={(payload) => save(r.id, payload)} /></div> },
  ];

  return (
    <div className="space-y-4">
      <h1 className="font-heading text-2xl">Recruitment trust workflow</h1>
      <div className="grid grid-cols-2 gap-3 text-xs"><div className="soft-card p-3">Unpublished recruitments: <b>{summary.unpublished}</b></div><div className="soft-card p-3">Publish blocked: <b>{summary.blocked}</b></div></div>
      {actionError && <div className="soft-card p-2 text-xs" data-testid="admin-recruitments-message">{actionError.message}</div>}

      {loading ? <LoadingSkeleton variant="table" /> : null}
      {!loading && error ? <ErrorState title="Failed to load recruitments" message={error.message} onRetry={load} /> : null}
      {!loading && !error && items.length === 0 ? <EmptyState title="No recruitments found" description="No admin recruitment rows are available right now." /> : null}
      {!loading && !error && items.length > 0 ? <AdminTable columns={columns} rows={items} getRowKey={(r) => r.id} emptyMessage="No recruitments to display." renderRowActions={(row) => <RecruitmentTrustActions row={row} onAction={act} busyKey={busyKey} />} /> : null}
    </div>
  );
}
