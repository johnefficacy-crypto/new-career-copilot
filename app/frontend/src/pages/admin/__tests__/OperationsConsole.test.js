import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

jest.mock("../../../lib/api", () => ({
  __esModule: true,
  api: { get: jest.fn(), post: jest.fn() },
  getApiUnverifiedFields: () => [],
}));

import { api } from "../../../lib/api";
import OperationsConsole from "../OperationsConsole";

const apiGetMock = api.get;
const apiPostMock = api.post;

const ONE_RECRUITMENT = {
  id: "rec-1",
  name: "Sample recruitment",
  publish_status: "needs_review",
  blocking_issues: [],
};
const ONE_QUEUE_ITEM = {
  id: "q-1",
  status: "pending",
  recruitment: "Sample queue candidate",
  source_name: "Official portal",
  source_type: "official_html",
  unverified_fields: [],
  duplicate_candidates: [],
};

function setupApi() {
  apiGetMock.mockReset();
  apiPostMock.mockReset();
  apiGetMock.mockImplementation((path) => {
    if (path.startsWith("/api/admin/sources")) return Promise.resolve({ items: [] });
    if (path.startsWith("/api/admin/scrape/runs")) return Promise.resolve({ items: [] });
    if (path.startsWith("/api/admin/scrape/queue")) return Promise.resolve({ items: [ONE_QUEUE_ITEM] });
    if (path.startsWith("/api/admin/recruitments")) return Promise.resolve({ items: [ONE_RECRUITMENT] });
    if (/\/conflicts$/.test(path)) return Promise.resolve({ items: [] });
    return Promise.resolve({ items: [] });
  });
  apiPostMock.mockResolvedValue({ ready: true });
}

function renderConsole(initialPath = "/admin/operations?mode=queue") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/admin/operations" element={<OperationsConsole />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OperationsConsole — PR-C surface", () => {
  beforeEach(() => setupApi());

  test("default Review & Publish does not render the 13-step AdminProgressBar; CurrentActionCard does", async () => {
    renderConsole();
    await waitFor(() => expect(screen.getByTestId("admin-operations-console")).toBeTruthy());
    expect(screen.getByTestId("oc-current-action")).toBeTruthy();
    expect(screen.queryByTestId("admin-progress-bar")).toBeNull();
  });

  test("opening 'View workflow details' surfaces the full AdminProgressBar in a drawer", async () => {
    renderConsole();
    await waitFor(() => expect(screen.getByTestId("oc-current-action-details")).toBeTruthy());
    await act(async () => {
      screen.getByTestId("oc-current-action-details").click();
    });
    expect(screen.getByTestId("admin-progress-bar")).toBeTruthy();
  });

  test("Candidates and Drafts are mutually exclusive — only one list at a time", async () => {
    renderConsole();
    await waitFor(() => expect(screen.getByTestId("ops-left-segmented")).toBeTruthy());
    expect(screen.queryByTestId("ops-left-candidates")).toBeTruthy();
    expect(screen.queryByTestId("ops-left-drafts")).toBeNull();
    await act(async () => {
      screen.getByTestId("ops-left-tab-drafts").click();
    });
    expect(screen.queryByTestId("ops-left-candidates")).toBeNull();
    expect(screen.queryByTestId("ops-left-drafts")).toBeTruthy();
  });

  test("deep link with recruitment_id defaults the left rail to Drafts", async () => {
    renderConsole("/admin/operations?mode=queue&recruitment_id=rec-1");
    await waitFor(() => expect(screen.getByTestId("ops-left-segmented")).toBeTruthy());
    expect(screen.queryByTestId("ops-left-drafts")).toBeTruthy();
    expect(screen.queryByTestId("ops-left-candidates")).toBeNull();
  });
});
