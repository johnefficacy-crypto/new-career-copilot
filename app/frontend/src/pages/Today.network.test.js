import React from "react";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Today should fan out to ≤4 backend GETs on first mount:
//   /api/study/mission-control
//   /api/recruitments
//   /api/applications/me
//   /api/profile/completion
// Mission-control already returns the data /api/study/plan,
// /api/study/focus/summary, /api/study/weekly-review and
// /api/recommendations/me used to provide for this page, so those
// endpoints must NOT be called here.

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

// Stub heavy children so they don't fan out their own data fetches.
jest.mock("../features/persona-questions/PersonaQuestionCard", () => () => null);
jest.mock("../features/exam-eligibility/EligibleExamsCard", () => () => null);
jest.mock("../features/study/components/IntelligenceLayersPanel", () => () => null);
jest.mock("../features/study/components/UpdateIntelligencePanel", () => () => null);
jest.mock("../features/study/components/PlanPreferencesCard", () => () => null);

import Today from "./Today";

const EMPTY_MC_RESPONSE = {
  user_context: { dimensions: {}, scores: {}, safe_user_explanation: [] },
  study_policy: {},
  plan: null,
  exam_context: null,
  competition_context: null,
  policy_update_context: null,
  update_context: null,
  today_tasks: [],
  plan_reasoning: [],
  metrics: {
    tasks_total: 0,
    tasks_completed: 0,
    task_completion_rate: 0,
    hours_studied_7d: 0,
    hours_planned_week: 0,
    adherence: null,
    backlog_count: 0,
    mocks_taken: 0,
  },
  next_best_action: null,
  truth_panel: { summary: "", warnings: [], corrections: [] },
  progressive_question: null,
  engine_trace: [],
  meta: {},
};

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockImplementation((path) => {
    if (path === "/api/study/mission-control") return Promise.resolve(EMPTY_MC_RESPONSE);
    if (path === "/api/recruitments") return Promise.resolve({ items: [], counts: {} });
    if (path === "/api/applications/me") return Promise.resolve({ items: [] });
    if (path === "/api/profile/completion") return Promise.resolve({ pct: 0 });
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
});

const ALLOWED = new Set([
  "/api/study/mission-control",
  "/api/recruitments",
  "/api/applications/me",
  "/api/profile/completion",
]);

const FORBIDDEN = new Set([
  "/api/study/plan",
  "/api/study/focus/summary",
  "/api/study/weekly-review",
  "/api/recommendations/me",
]);

test("Today first mount fetches only the four allowed endpoints", async () => {
  render(
    <MemoryRouter>
      <Today />
    </MemoryRouter>,
  );
  await waitFor(() => expect(mockGet).toHaveBeenCalledWith("/api/study/mission-control"));
  // Let the dashboard hook's Promise.all settle.
  await waitFor(() => expect(mockGet).toHaveBeenCalledWith("/api/profile/completion"));

  const paths = mockGet.mock.calls.map(([p]) => p);
  const unique = new Set(paths);
  for (const p of unique) {
    expect(ALLOWED.has(p)).toBe(true);
    expect(FORBIDDEN.has(p)).toBe(false);
  }
  expect(unique.size).toBeLessThanOrEqual(4);
});

test("Today does not call deprecated dashboard endpoints", async () => {
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
