import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../lib/api";

const EMPTY = Object.freeze([]);

export default function useConflicts(queueId) {
  const [conflicts, setConflicts] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Cancel token: each fetch increments the request id; only the latest
  // response is allowed to call setState. Prevents a stale fetch from
  // overwriting a newer one when queueId flips quickly.
  const reqIdRef = useRef(0);

  const fetchFor = useCallback(async (qid, reqId) => {
    if (!qid) {
      setConflicts(EMPTY);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/api/admin/scrape/items/${qid}/conflicts`);
      if (reqIdRef.current !== reqId) return;
      setConflicts(Array.isArray(res?.items) ? res.items : EMPTY);
    } catch (e) {
      if (reqIdRef.current !== reqId) return;
      setError(e);
      setConflicts(EMPTY);
    } finally {
      if (reqIdRef.current === reqId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = ++reqIdRef.current;
    fetchFor(queueId, id);
  }, [queueId, fetchFor]);

  const refetch = useCallback(() => {
    const id = ++reqIdRef.current;
    return fetchFor(queueId, id);
  }, [queueId, fetchFor]);

  return { conflicts, loading, error, refetch };
}
