import { useCallback, useEffect, useRef, useState } from "react";
import { verificationReportsService } from "../../../services/verificationReportsService";

const EMPTY = Object.freeze([]);

// List hook. Filters mirror the backend query params; pass them as an
// object so consumers can compose filter pills. Re-fetches on every
// filter change (referential identity is enough — pass a stable
// memoised object from the parent to avoid storms).
export default function useVerificationReports(filters = {}) {
  const [items, setItems] = useState(EMPTY);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const reqIdRef = useRef(0);

  const fetchNow = useCallback(async (reqId, params) => {
    setLoading(true);
    setError(null);
    try {
      const res = await verificationReportsService.list(params || {});
      if (reqIdRef.current !== reqId) return;
      setItems(Array.isArray(res?.items) ? res.items : EMPTY);
      setTotal(res?.total ?? null);
    } catch (e) {
      if (reqIdRef.current !== reqId) return;
      setError(e);
      setItems(EMPTY);
    } finally {
      if (reqIdRef.current === reqId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = ++reqIdRef.current;
    fetchNow(id, filters);
  }, [filters, fetchNow]);

  const refetch = useCallback(() => {
    const id = ++reqIdRef.current;
    return fetchNow(id, filters);
  }, [filters, fetchNow]);

  return { items, total, loading, error, refetch };
}
