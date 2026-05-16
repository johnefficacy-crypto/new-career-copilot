import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";

/**
 * Fetch a collection from the API, with seed-vs-live disambiguation.
 *
 * Replaces the copy-pasted pattern across community screens:
 *
 *   const [items, setItems] = useState(SEED);
 *   useEffect(() => {
 *     api.get(url).then((d) => {
 *       if (Array.isArray(d?.items) && d.items.length > 0) setItems(d.items);
 *     }).catch(() => {});
 *   }, []);
 *
 * That pattern silently mixes seed fixtures into the live UI: an empty backend
 * response is interpreted as "use the seeds," so users see fictional data they
 * can't act on. This hook separates the four states cleanly:
 *
 *   - "loading" — first fetch hasn't returned yet; render seed for ghost UI.
 *   - "live"    — backend returned ≥1 item; render those.
 *   - "empty"   — backend returned 0 items; render <EmptyState/>, NOT seed.
 *   - "error"   — fetch failed; render seed (offline-friendly) but flag it.
 *
 * Pass `adapter(item, index) => item` to normalize backend shape before storing.
 */
export default function useApiCollection(url, seed = [], options = {}) {
  const { adapter, params } = options;
  const [items, setItems] = useState(seed);
  const [status, setStatus] = useState("loading");

  // Stable reference so the effect doesn't refetch every render.
  const paramsKey = params ? JSON.stringify(params) : "";
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;

  const refresh = useCallback(async () => {
    try {
      const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
      const d = await api.get(`${url}${qs}`);
      const raw = Array.isArray(d?.items) ? d.items : Array.isArray(d) ? d : null;
      if (raw === null) {
        setStatus("error");
        return;
      }
      const next = adapterRef.current ? raw.map((it, i) => adapterRef.current(it, i)) : raw;
      setItems(next);
      setStatus(next.length === 0 ? "empty" : "live");
    } catch {
      // Keep seed visible; flag error so screens can show a banner if they care.
      setStatus("error");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, paramsKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { items, status, refresh, setItems };
}
