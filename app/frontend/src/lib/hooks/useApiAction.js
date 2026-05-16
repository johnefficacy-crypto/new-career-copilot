import { useCallback, useState } from "react";
import { useToast } from "../../shared/ui";

/**
 * Standard mutation runner for community/study/feature screens.
 *
 * Pattern: optimistic UI update → POST → roll back on failure with toast.
 *
 * Usage:
 *   const { run, busy } = useApiAction();
 *   run({
 *     action: () => api.post(`/api/community/.../vote`, { direction }),
 *     optimistic: () => setLocalVote(wanted),
 *     rollback: () => setLocalVote(previous),
 *     errorMessage: "Could not record vote.",
 *   });
 *
 * `successMessage` is optional — omit it for silent-success actions like votes.
 */
export default function useApiAction() {
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const run = useCallback(
    async ({ action, optimistic, rollback, onSuccess, successMessage, errorMessage, confirm }) => {
      if (confirm && !window.confirm(confirm)) return { ok: false, cancelled: true };
      if (optimistic) optimistic();
      setBusy(true);
      try {
        const result = await action();
        if (successMessage) toast.success(successMessage);
        if (onSuccess) onSuccess(result);
        return { ok: true, data: result };
      } catch (e) {
        if (rollback) rollback();
        toast.error(errorMessage || e?.message || "Action failed");
        return { ok: false, error: e };
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  return { run, busy };
}
