import { useState } from "react";
import { useToast } from "../../../shared/ui";

export default function useAdminAction() {
  const [busyKey, setBusyKey] = useState(null);
  const [error, setError] = useState(null);
  const toast = useToast();

  const runAction = async ({ key, action, successMessage, errorMessage, confirm }) => {
    if (confirm && !window.confirm(confirm)) return false;
    setBusyKey(key);
    setError(null);
    try {
      const result = await action();
      if (successMessage) toast.success(successMessage);
      return result;
    } catch (e) {
      setError(e);
      toast.error(errorMessage || e.message || "Action failed");
      return false;
    } finally {
      setBusyKey(null);
    }
  };

  return { runAction, busyKey, error };
}
