import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";

jest.mock("../../../lib/api", () => {
  const get = jest.fn();
  return { __esModule: true, api: { get } };
});

import { api } from "../../../lib/api";
import useConflicts from "./useConflicts";


afterEach(() => {
  api.get.mockReset();
});


test("returns empty conflicts and skips fetch when queueId is null", async () => {
  const { result } = renderHook(() => useConflicts(null));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.conflicts).toEqual([]);
  expect(result.current.error).toBeNull();
  expect(api.get).not.toHaveBeenCalled();
});


test("fetches conflicts when queueId is set", async () => {
  const items = [
    { id: "c1", field_key: "apply_end_date", status: "open", candidates: [] },
    { id: "c2", field_key: "total_vacancies", status: "open", candidates: [] },
  ];
  api.get.mockResolvedValueOnce({ items, total: 2 });

  const { result } = renderHook(() => useConflicts("queue-1"));
  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(api.get).toHaveBeenCalledWith("/api/admin/scrape/items/queue-1/conflicts");
  expect(result.current.conflicts).toEqual(items);
  expect(result.current.error).toBeNull();
});


test("re-fetches when queueId changes", async () => {
  api.get
    .mockResolvedValueOnce({ items: [{ id: "c1" }] })
    .mockResolvedValueOnce({ items: [{ id: "c2" }, { id: "c3" }] });

  const { result, rerender } = renderHook(({ qid }) => useConflicts(qid), {
    initialProps: { qid: "queue-1" },
  });
  await waitFor(() => expect(result.current.conflicts).toEqual([{ id: "c1" }]));

  rerender({ qid: "queue-2" });
  await waitFor(() => expect(result.current.conflicts).toEqual([{ id: "c2" }, { id: "c3" }]));

  expect(api.get).toHaveBeenNthCalledWith(1, "/api/admin/scrape/items/queue-1/conflicts");
  expect(api.get).toHaveBeenNthCalledWith(2, "/api/admin/scrape/items/queue-2/conflicts");
});


test("refetch re-invokes the API for the current queueId", async () => {
  api.get
    .mockResolvedValueOnce({ items: [{ id: "c1" }] })
    .mockResolvedValueOnce({ items: [{ id: "c1", status: "resolved_by_admin" }, { id: "c2" }] });

  const { result } = renderHook(() => useConflicts("queue-1"));
  await waitFor(() => expect(result.current.conflicts.length).toBe(1));

  await act(async () => {
    await result.current.refetch();
  });

  expect(api.get).toHaveBeenCalledTimes(2);
  expect(api.get).toHaveBeenLastCalledWith("/api/admin/scrape/items/queue-1/conflicts");
  expect(result.current.conflicts).toEqual([
    { id: "c1", status: "resolved_by_admin" },
    { id: "c2" },
  ]);
});


test("clears conflicts when queueId flips to null", async () => {
  api.get.mockResolvedValueOnce({ items: [{ id: "c1" }] });

  const { result, rerender } = renderHook(({ qid }) => useConflicts(qid), {
    initialProps: { qid: "queue-1" },
  });
  await waitFor(() => expect(result.current.conflicts).toEqual([{ id: "c1" }]));

  rerender({ qid: null });
  await waitFor(() => expect(result.current.conflicts).toEqual([]));
  expect(result.current.error).toBeNull();
  // Only the initial fetch fired — flipping to null must not hit the API.
  expect(api.get).toHaveBeenCalledTimes(1);
});


test("surfaces fetch errors and resets conflicts", async () => {
  const err = new Error("boom");
  api.get.mockRejectedValueOnce(err);

  const { result } = renderHook(() => useConflicts("queue-1"));
  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.error).toBe(err);
  expect(result.current.conflicts).toEqual([]);
});
