/**
 * OperationsConsole — resolve-official-source UX flow.
 *
 * Pins the fixes for the "feels stuck after resolve" report:
 *  - P0-1: CurrentActionCard primary button calls the parent handler.
 *  - P0-2: selection survives loadAll (URL-param driven + re-find by id);
 *          a vanished selection clears the param and toasts.
 *  - P1-1: selecting a queue item hydrates extracted_data via include_detail.
 *  - P2-1: success toast fires after a resolve.
 *  - AdminFixPanel: once official_source_resolved=true the resolver is gone
 *    and the promote bar reads "Ready to promote".
 */
import React from "react";
import { act, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
const mockToastInfo = jest.fn();

jest.mock("../../../lib/api", () => ({
  __esModule: true,
  api: { get: jest.fn(), post: jest.fn() },
  getApiUnverifiedFields: () => [],
}));

jest.mock("../../../shared/ui", () => {
  const actual = jest.requireActual("../../../shared/ui");
  return {
    ...actual,
    useToast: () => ({
      success: mockToastSuccess,
      error: mockToastError,
      info: mockToastInfo,
    }),
  };
});

beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
  if (typeof window !== "undefined" && !window.requestAnimationFrame) {
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  }
});

import { api } from "../../../lib/api";
import OperationsConsole from "../OperationsConsole";

const apiGetMock = api.get;
const apiPostMock = api.post;

const HOST = "upsc.gov.in";
const OFFICIAL_URL = `https://${HOST}/notice.pdf`;

const QUEUE_ITEM_UNRESOLVED = {
  id: "q-1",
  status: "pending",
  recruitment: "Sample queue candidate",
  source_name: "Aggregator portal",
  source_type: "aggregator",
  unverified_fields: [],
  duplicate_candidates: [],
  official_source_resolved: false,
  promotable: false,
  open_conflicts: 0,
};

const QUEUE_ITEM_RESOLVED = {
  ...QUEUE_ITEM_UNRESOLVED,
  source_name: "Official portal",
  source_type: "official_html",
  official_source_resolved: true,
  promotable: true,
};

const DETAIL_ROW = {
  ...QUEUE_ITEM_UNRESOLVED,
  extracted_data: { title: "Sample queue candidate", official_notification_url: OFFICIAL_URL },
  raw_extracted_item: { title: "Sample queue candidate", official_notification_url: OFFICIAL_URL },
};

let resolvedNow = false;

function setupApi() {
  apiGetMock.mockReset();
  apiPostMock.mockReset();
  mockToastSuccess.mockReset();
  mockToastError.mockReset();
  mockToastInfo.mockReset();
  resolvedNow = false;

  apiGetMock.mockImplementation((path) => {
    if (path.startsWith("/api/admin/sources")) return Promise.resolve({ items: [] });
    if (path.startsWith("/api/admin/scrape/runs")) return Promise.resolve({ items: [] });
    if (path.startsWith("/api/admin/scrape/queue")) {
      if (path.includes("include_detail=true")) return Promise.resolve({ items: [DETAIL_ROW] });
      return Promise.resolve({ items: [resolvedNow ? QUEUE_ITEM_RESOLVED : QUEUE_ITEM_UNRESOLVED] });
    }
    if (path.startsWith("/api/admin/recruitments")) return Promise.resolve({ items: [] });
    if (/\/conflicts$/.test(path)) return Promise.resolve({ items: [] });
    return Promise.resolve({ items: [] });
  });

  apiPostMock.mockImplementation((path) => {
    if (path.includes("/draft-sources")) {
      return Promise.resolve({
        created: [{ id: "src-1", official_url: `https://${HOST}/`, source_name: "UPSC" }],
        existing: [],
      });
    }
    if (path.includes("/verify")) return Promise.resolve({ errors: [] });
    if (path.includes("/resolve-official-source")) {
      resolvedNow = true; // the next list refetch reflects the resolved row
      return Promise.resolve({ ok: true, official_source_resolved: true });
    }
    return Promise.resolve({ ok: true });
  });
}

function renderConsole(initialPath = "/admin/operations?mode=queue&queue_id=q-1") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/admin/operations" element={<OperationsConsole />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OperationsConsole — resolve official source UX", () => {
  beforeEach(() => setupApi());

  test("P1-1: selecting a queue item hydrates detail via include_detail", async () => {
    renderConsole();
    await waitFor(() => expect(screen.getByTestId("admin-operations-console")).toBeTruthy());
    await waitFor(() =>
      expect(
        apiGetMock.mock.calls.some(
          ([p]) => p.includes("include_detail=true") && p.includes("item_id=q-1"),
        ),
      ).toBe(true),
    );
  });

  test("P1-2: resolver auto-detects the host candidate from hydrated extracted_data", async () => {
    renderConsole();
    await waitFor(() => expect(screen.getByTestId("official-source-quick-resolver")).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId(`quick-host-${HOST}`)).toBeTruthy());
  });

  test("P0-2: selection stays on X after refetch; no 'vanished' toast", async () => {
    renderConsole();
    await waitFor(() => expect(screen.getByTestId("queue-fix-section")).toBeTruthy());
    expect(screen.getByTestId("queue-fix-section").textContent).toContain("q-1");
    expect(mockToastInfo).not.toHaveBeenCalled();
  });

  test("P0-2: vanished selection clears the param and toasts", async () => {
    apiGetMock.mockImplementation((path) => {
      if (path.startsWith("/api/admin/scrape/queue")) return Promise.resolve({ items: [] });
      return Promise.resolve({ items: [] });
    });
    renderConsole();
    await waitFor(() => expect(mockToastInfo).toHaveBeenCalled());
    expect(mockToastInfo.mock.calls[0][0]).toMatch(/no longer in the queue/i);
  });

  test("P0-1: CurrentActionCard primary button invokes the parent handler (no dead button)", async () => {
    renderConsole();
    await waitFor(() => expect(screen.getByTestId("oc-current-action-primary")).toBeTruthy());
    const btn = screen.getByTestId("oc-current-action-primary");
    expect(btn.disabled).toBe(false);
    await act(async () => { fireEvent.click(btn); });
    // The handler scrolls inside requestAnimationFrame, so allow it to flush.
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
  });

  test("full flow: resolve → resolver disappears, promote bar ready, success toast", async () => {
    renderConsole();
    await waitFor(() => expect(screen.getByTestId(`quick-action-${HOST}`)).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByTestId(`quick-action-${HOST}`));
    });

    // After the resolve chain + reload, the list returns the resolved row.
    await waitFor(() =>
      expect(screen.queryByTestId("official-source-quick-resolver")).toBeNull(),
    );
    // P2-1 success toast.
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    expect(mockToastSuccess.mock.calls.some(([m]) => /official proof attached/i.test(m))).toBe(true);
    // Promote bar flips to ready.
    expect(screen.getByTestId("promote-bar").textContent).toMatch(/ready to promote/i);
    // Selection survived the reload.
    expect(screen.getByTestId("queue-fix-section").textContent).toContain("q-1");
  });
});
