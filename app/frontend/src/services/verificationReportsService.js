import { api } from "../lib/api";

// Client for the verification-gateway admin API surface (PR plan §7).
// Every method is a thin wrapper over the backend route — no
// frontend-side business logic, no derived labels.
export const verificationReportsService = {
  list: (params = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") qs.append(k, v);
    }
    const suffix = qs.toString() ? `?${qs}` : "";
    return api.get(`/api/admin/verification-reports${suffix}`);
  },
  get: (id) => api.get(`/api/admin/verification-reports/${id}`),

  // PR2 surfaces.
  runResolver: (id) =>
    api.post(`/api/admin/verification-reports/${id}/run-resolver`, {}),
  confirmSuggestedProof: (id, body) =>
    api.post(`/api/admin/verification-reports/${id}/confirm-suggested-proof`, body),

  // PR3 surface.
  overrideConflict: (id, body) =>
    api.post(`/api/admin/verification-reports/${id}/override-conflict`, body),

  // PR6 surfaces.
  promote: (id, body = {}) =>
    api.post(`/api/admin/verification-reports/${id}/promote`, body),
  reject: (id, body = {}) =>
    api.post(`/api/admin/verification-reports/${id}/reject`, body),

  // Bulk — always dry-run first per plan §6 rule.
  bulkDryRun: (body) =>
    api.post(`/api/admin/verification-reports/bulk-dry-run`, body),
  bulkApply: (body) =>
    api.post(`/api/admin/verification-reports/bulk-apply`, body),

  // PR5 paired surface.
  listBatches: ({ acknowledged = false, limit } = {}) => {
    const qs = new URLSearchParams();
    qs.set("acknowledged", String(acknowledged));
    if (limit) qs.set("limit", String(limit));
    return api.get(`/api/admin/reverification-batches?${qs}`);
  },
  acknowledgeBatch: (batchId) =>
    api.post(`/api/admin/verification-reports/acknowledge-batch/${batchId}`, {}),
};
