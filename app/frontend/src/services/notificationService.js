import { api } from "../lib/api";

export const notificationService = {
  listMyNotifications: (queryString = "") => api.get(`/api/notifications/me${queryString ? `?${queryString}` : ""}`),
  markRead: (alertIds = []) => api.post("/api/notifications/me/read", { alert_ids: alertIds }),
  markAllRead: () => api.post("/api/notifications/me/read", {}),
};
