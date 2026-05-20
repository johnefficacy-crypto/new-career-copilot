// StudyHome adopts /api/study/mission-control as its source of truth.
// This test pins the network contract: the page must call mission-control
// (NOT /api/study/plan or /api/study/focus/summary) plus the report-card
// endpoints — nothing else.
import React from "react";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockGet = jest.fn();
jest.mock("../../lib/api", () => ({
  __esModule: true,
  api: { get: (...a) => mockGet(...a), post: jest.fn() },
}));

// Heavy child cards make their own fetches / pull context; stub them so
// this test observes only StudyHome's own calls.
jest.mock("../../features/study/components/ExamCycleTimeline", () => () => null);
jest.mock("../../features/study/components/PlanChangeLogCard", () => () => null);
jest.mock("../../shared/components/HowItWorksHeaderButton", () => () => null);

// eslint-disable-next-line global-require
const StudyHome = require("./StudyHome").default;

const MC_RESPONSE = {
  plan: { id: "plan-1", target: "Cover locked topics", theme: "Adaptive" },
  today_tasks: [
    { id: "t1", title: "Percentage", status: "planned", done: false },
  ],
  focus: {
    total_hours_7d: 3.5,
    week: [{ date: "2026-05-20", minutes: 45 }],
  },
  exam_context: { high_yield_topics: [] },
  competition_context: {},
  plan_reasoning: {},
};

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockImplementation((url) => {
    if (url === "/api/study/mission-control") return Promise.resolve(MC_RESPONSE);
    if (url.startsWith("/api/study/report-card/history")) return Promise.resolve({ items: [] });
    if (url.startsWith("/api/study/report-card")) return Promise.resolve(null);
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
});

function renderPage() {
  return render(
    <MemoryRouter>
      <StudyHome />
    </MemoryRouter>,
  );
}

test("calls mission-control, never /api/study/plan or /focus/summary", async () => {
  renderPage();
  await waitFor(() => expect(mockGet).toHaveBeenCalledWith("/api/study/mission-control"));

  const urls = mockGet.mock.calls.map((c) => c[0]);
  // Mission control is the plan/focus source of truth now.
  expect(urls).toContain("/api/study/mission-control");
  // The legacy split calls must be gone.
  expect(urls).not.toContain("/api/study/plan");
  expect(urls).not.toContain("/api/study/focus/summary");
  // Report card stays a separate fetch.
  expect(urls.some((u) => u.startsWith("/api/study/report-card"))).toBe(true);
});

test("only mission-control + report-card endpoints are hit", async () => {
  renderPage();
  await waitFor(() => expect(mockGet).toHaveBeenCalledWith("/api/study/mission-control"));
  // Let the report-card promises settle.
  await waitFor(() =>
    expect(mockGet.mock.calls.some((c) => c[0].startsWith("/api/study/report-card"))).toBe(true),
  );

  const urls = mockGet.mock.calls.map((c) => c[0]);
  const allowed = (u) =>
    u === "/api/study/mission-control" || u.startsWith("/api/study/report-card");
  const unexpected = urls.filter((u) => !allowed(u));
  expect(unexpected).toEqual([]);
});

test("renders the plan + focus cards from mission-control data", async () => {
  const { findByTestId } = renderPage();
  // ActivePlanCard renders once MC resolves.
  await findByTestId("study-home-plan");
  await findByTestId("study-home-focus");
});
