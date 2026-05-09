import { useCallback, useEffect, useState } from "react";
import { api } from "../../../lib/api";

function toQuery(filters) {
  const query = new URLSearchParams();
  if (filters.unreadOnly) query.set("unread_only", "true");
  if (filters.priority) query.set("priority", filters.priority);
  if (filters.type) query.set("alert_type", filters.type);
  return query.toString();
}

export default function useNotifications(filters) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = toQuery(filters);
      const d = await api.get(`/api/notifications/me${query ? `?${query}` : ""}`);
      setItems(Array.isArray(d?.items) ? d.items : []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { reload(); }, [reload]);

  const markRead = useCallback(async (id) => {
    await api.post("/api/notifications/me/read", { alert_ids: [id] });
    await reload();
  }, [reload]);

  const markAllRead = useCallback(async () => {
    await api.post("/api/notifications/me/read", {});
    await reload();
  }, [reload]);

  return { loading, error, items, reload, markRead, markAllRead };
}
