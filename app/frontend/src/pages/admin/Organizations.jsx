import React, { useEffect, useState } from "react";
import OrganizationEditPanel from "../../features/admin/organizations/OrganizationEditPanel";
import { api } from "../../lib/api";
import { AdminTable, EmptyState, ErrorState, LoadingSkeleton, RowActions, StatusBadge } from "../../shared/ui";
import useAdminAction from "../../features/admin/shared/useAdminAction";
import AuditTimelineDrawer from "../../features/admin/shared/AuditTimelineDrawer";
import { adminTrustService } from "../../services/adminTrustService";

export default function AdminOrganizations() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [auditTarget, setAuditTarget] = useState(null);
  const [auditItems, setAuditItems] = useState([]);
  const [error, setError] = useState(null);
  const { runAction, busyKey, error: actionError } = useAdminAction();

  const load = async () => {
    setLoading(true); setError(null);
    try { const d = await api.get("/api/admin/organizations"); setItems(d.items || []); } catch (e) { setError(e); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const verify = async (id, name) => runAction({ key: `verify-${id}`, confirm: `Verify ${name}?`, successMessage: `${name} verified`, action: async () => { await api.post(`/api/admin/organizations/${id}/verify`, {}); await load(); } });
  const save = async (id, payload) => runAction({ key: `save-${id}`, successMessage: "Organization saved", action: async () => { await api.put(`/api/admin/organizations/${id}`, payload || {}); await load(); } });
  const showHistory = async (o) => { const d = await adminTrustService.organizationAudit(o.id); setAuditItems(d.items || []); setAuditTarget(o); };

  const columns = [
    { key: "name", header: "Organization", render: (o) => <div><div className="font-medium">{o.name}</div><div className="text-xs text-muted-foreground">{o.type || "—"} · {o.state || "—"}</div></div> },
    { key: "website", header: "Website", render: (o) => o.website_url || o.official_website || "—" },
    { key: "official_domain", header: "Official domain", render: (o) => o.official_domain || "—" },
    { key: "trust_tier", header: "Trust tier", render: (o) => <StatusBadge status={o.trust_tier || "pending"} label={o.trust_tier || "Unknown"} /> },
    { key: "verification", header: "Verification", render: (o) => <StatusBadge status={o.is_verified ? "verified" : "pending"} label={o.is_verified ? "Verified" : "Pending"} /> },
    { key: "verified_at", header: "Verified at", render: (o) => o.verified_at || "—" },
    { key: "links", header: "Links", render: (o) => <div className="text-xs">sources: {o.linked_sources_count}<br />recruitments: {o.linked_recruitments_count}</div> },
    { key: "edit", header: "Edit", render: (o) => <OrganizationEditPanel org={o} onSave={(payload) => save(o.id, payload)} busy={busyKey === `save-${o.id}`} /> },
  ];

  return <div className="space-y-4"><h1 className="font-heading text-2xl">Organizations trust</h1>{actionError && <div className="soft-card p-2 text-xs">{actionError.message}</div>}{loading ? <LoadingSkeleton variant="table" /> : null}{!loading && error ? <ErrorState title="Failed to load organizations" message={error.message} onRetry={load} /> : null}{!loading && !error && items.length === 0 ? <EmptyState title="No organizations found" description="No organizations available for review." /> : null}{!loading && !error && items.length > 0 ? <AdminTable columns={columns} rows={items} getRowKey={(o) => o.id} renderRowActions={(o) => <RowActions groupLabel={`Row actions for ${o.name}`} actions={[{ label: "Verify", ariaLabel: `Verify organization ${o.name}`, onClick: () => verify(o.id, o.name), disabled: busyKey === `verify-${o.id}` }, { label: "View history", ariaLabel: `View history for organization ${o.name}`, onClick: () => showHistory(o) }]} />} /> : null}<AuditTimelineDrawer open={!!auditTarget} title={auditTarget?.name || "Organization"} items={auditItems} onClose={() => setAuditTarget(null)} /></div>;
}
