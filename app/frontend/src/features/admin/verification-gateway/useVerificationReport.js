import { useCallback, useEffect, useRef, useState } from "react";
import { verificationReportsService } from "../../../services/verificationReportsService";

export default function useVerificationReport(reportId) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const reqIdRef = useRef(0);

  const fetchNow = useCallback(async (id, reqId) => {
    if (!id) {
      setReport(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await verificationReportsService.get(id);
      if (reqIdRef.current !== reqId) return;
      setReport(res || null);
    } catch (e) {
      if (reqIdRef.current !== reqId) return;
      setError(e);
      setReport(null);
    } finally {
      if (reqIdRef.current === reqId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const reqId = ++reqIdRef.current;
    fetchNow(reportId, reqId);
  }, [reportId, fetchNow]);

  const refetch = useCallback(() => {
    const reqId = ++reqIdRef.current;
    return fetchNow(reportId, reqId);
  }, [reportId, fetchNow]);

  return { report, loading, error, refetch };
}
