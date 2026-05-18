import { QueryClient } from "@tanstack/react-query";

// Dashboard-heavy pages (Today, etc.) don't need refetch storms on
// window focus, route remount, or network reconnect — the underlying
// data is computed at most every couple of minutes server-side. Tighten
// the default to a 60s stale window with refetch storms disabled.
// Individual hooks that DO want fresh data on focus can override.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 1,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});
