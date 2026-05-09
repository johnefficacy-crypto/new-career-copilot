import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { useToast } from "../../../shared/ui";

function toQuery(filters) {
  const query = new URLSearchParams();
  if (filters.unreadOnly) query.set("unread_only", "true");
  if (filters.priority) query.set("priority", filters.priority);
  if (filters.type) query.set("alert_type", filters.type);
  return query.toString();
}

export default function useNotifications(filters) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const queryKey = useMemo(() => ["notifications", filters], [filters]);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const q = toQuery(filters);
      const d = await api.get(`/api/notifications/me${q ? `?${q}` : ""}`);
      return Array.isArray(d?.items) ? d.items : [];
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (id) => api.post("/api/notifications/me/read", { alert_ids: [id] }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old = []) => old.map((n) => (n.id === id ? { ...n, read: true } : n)));
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast.error("Could not mark notification as read.");
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => api.post("/api/notifications/me/read", {}),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old = []) => old.map((n) => ({ ...n, read: true })));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast.error("Could not mark all notifications as read.");
    },
  });

  return {
    loading: query.isLoading,
    error: query.error,
    items: query.data || [],
    reload: query.refetch,
    markRead: (id) => markReadMutation.mutateAsync(id),
    markAllRead: () => markAllReadMutation.mutateAsync(),
  };
}
