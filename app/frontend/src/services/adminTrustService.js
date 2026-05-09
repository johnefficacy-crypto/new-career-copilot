import { api } from "../lib/api";

export const adminTrustService = {
  listOrganizations: () => api.get("/api/admin/organizations"),
  verifyOrganization: (id) => api.post(`/api/admin/organizations/${id}/verify`, {}),
  updateOrganization: (id, body) => api.put(`/api/admin/organizations/${id}`, body),

  listSources: () => api.get("/api/admin/sources"),
  createSource: (body) => api.post("/api/admin/sources", body),
  verifySource: (id) => api.post(`/api/admin/sources/${id}/verify`, {}),
  activateSource: (id) => api.post(`/api/admin/sources/${id}/activate`, {}),
  deactivateSource: (id) => api.post(`/api/admin/sources/${id}/deactivate`, {}),
  sourceAudit: (id) => api.get(`/api/admin/sources/${id}/audit`),
  organizationAudit: (id) => api.get(`/api/admin/organizations/${id}/audit`),

  listRecruitments: () => api.get("/api/admin/recruitments"),
  updateRecruitment: (id, body) => api.put(`/api/admin/recruitments/${id}`, body),
  recruitmentAction: (id, action) => api.post(`/api/admin/recruitments/${id}/${action}`, {}),

  listEligibilityQueue: () => api.get("/api/admin/eligibility-queue"),
  promoteQueueItem: (id) => api.post(`/api/admin/scrape/items/${id}/promote`, {}),
  rejectQueueItem: (id, body) => api.post(`/api/admin/scrape/items/${id}/reject`, body),
};
