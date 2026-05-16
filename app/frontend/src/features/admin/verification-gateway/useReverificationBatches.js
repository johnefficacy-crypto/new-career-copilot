import { useCallback, useEffect, useRef, useState } from "react";
import { verificationReportsService } from "../../../services/verificationReportsService";

const EMPTY = Object.freeze([]);

export default function useReverificationBatches({ acknowledged = false, limit = 50 } = {}) {
  const [items, setItems] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const reqIdRef = useRef(0);

  const fetchNow = useCallback(async (reqId) => {
    setLoading(true);
    setError(null);
    try {
      const res = await verificationReportsService.listBatches({ acknowledged, limit });
      if (reqIdRef.current !== reqId) return;
      setItems(Array.isArray(res?.items) ? res.items : EMPTY);
    } catch (e) {
      if (reqIdRef.current !== reqId) return;
      setError(e);
      setItems(EMPTY);
    } finally {
      if (reqIdRef.current === reqId) setLoading(false);
    }
  }, [acknowledged, limit]);

  useEffect(() => {
    const id = ++reqIdRef.current;
    fetchNow(id);
  }, [fetchNow]);

  const refetch = useCallback(() => {
    const id = ++reqIdRef.current;
    return fetchNow(id);
  }, [fetchNow]);

  return { items, loading, error, refetch };
}
