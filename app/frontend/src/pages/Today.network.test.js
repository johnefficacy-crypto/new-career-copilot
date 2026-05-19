import React from "react";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// PR3 reorg: Today is scoped to "what to act on today" and no longer
// loads /api/study/mission-control. The page now fans out to at most
// three backend GETs on first mount:
//   /api/recruitments
//   /api/applications/me
//   /api/profile/completion
// Everything mission-control-derived (study tasks, metrics row, truth
// panel, plan reasoning, intelligence layers, study policy) moved out
// of Today; Study Home will fetch its own subset in a later PR.

const mockGet = jest.fn();

jest.mock("../lib/api", () => ({
  __esModule: true,
  api: {
    get: (...args) => mockGet(...args),
    post: jest.fn(),
  },
}));

jest.mock("../lib/authContext", () => ({
  useAuth: () => ({ user: { name: "Tester" } }),
}));

jest.mock("../lib/hooks/useApiAction", () => ({
  __esModule: true,
  default: () => ({ run: jest.fn() }),
}));

// PR5: TodayProfileBanner uses react-query via useProfileCompletion.
// The Today.network test doesn't mount a QueryClientProvider (it only
// cares about the page's own fetch fan-out), so we stub the hook so
// it doesn't crash and doesn't add a phantom GET to the assertion.
jest.mock("../features/profile/hooks/useProfileCompletion", () => ({
  __esModule: true,
  default: () => ({ pct: 90, status: "green", loading: false, error: null }),
}));

import Today from "./Today";

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockImplementation((path) => {
    if (path === "/api/recruitments") return Promise.resolve({ items: [], counts: {} });
    if (path === "/api/applications/me") return Promise.resolve({ items: [] });
    if (path === "/api/profile/completion") return Promise.resolve({ pct: 0 });
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
});

const ALLOWED = new Set([
  "/api/recruitments",
  "/api/applications/me",
  "/api/profile/completion",
]);

const FORBIDDEN = new Set([
  "/api/study/mission-control",
  "/api/study/plan",
  "/api/study/focus/summary",
  "/api/study/weekly-review",
  "/api/recommendations/me",
  "/api/persona/questions/next",
  "/api/exams/eligibility-summary",
]);

test("Today first mount fetches only the allowed dashboard endpoints", async () => {
  render(
    <MemoryRouter>
      <Today />
    </MemoryRouter>,
  );
  await waitFor(() => expect(mockGet).toHaveBeenCalledWith("/api/recruitments"));
  await waitFor(() => expect(mockGet).toHaveBeenCalledWith("/api/applications/me"));
  await waitFor(() => expect(mockGet).toHaveBeenCalledWith("/api/profile/completion"));

  const paths = mockGet.mock.calls.map(([p]) => p);
  const unique = new Set(paths);
  for (const p of unique) {
    expect(ALLOWED.has(p)).toBe(true);
    expect(FORBIDDEN.has(p)).toBe(false);
  }
  expect(unique.size).toBeLessThanOrEqual(3);
});

test("Today does not call mission-control or deprecated dashboard endpoints", async () => {
  render(
    <MemoryRouter>
      <Today />
    </MemoryRouter>,
  );
  await waitFor(() => expect(mockGet).toHaveBeenCalledWith("/api/profile/completion"));
  const paths = mockGet.mock.calls.map(([p]) => p);
  for (const banned of FORBIDDEN) {
    expect(paths).not.toContain(banned);
  }
});
