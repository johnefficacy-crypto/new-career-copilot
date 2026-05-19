import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockGet = jest.fn();
const mockPut = jest.fn();
const mockPost = jest.fn();
const mockDel = jest.fn();

jest.mock("../../lib/api", () => ({
  __esModule: true,
  api: {
    get: (...args) => mockGet(...args),
    put: (...args) => mockPut(...args),
    post: (...args) => mockPost(...args),
    del: (...args) => mockDel(...args),
  },
}));

jest.mock("../../features/study/components/PlanChangeLogCard", () => () => null);
jest.mock("../../features/study/components/PlanByTopic", () => () => null);
jest.mock("../../features/study/components/ExamCycleTimeline", () => () => null);

jest.mock("../../lib/hooks/useApiAction", () => ({
  __esModule: true,
  default: () => ({ run: jest.fn() }),
}));

import StudyPlan from "../StudyPlan";

const EXAM_ID = "11111111-1111-4111-8111-111111111111";

const APPROVED_LABELS = [
  "Regenerate plan",
  "Suggest changes",
  "Preview changes",
  "Apply selected changes",
];

const FORBIDDEN_STRINGS = [
  "Regenerate with AI",
  "Regenerate using AI",
  "Apply AI changes",
  "AI-generated plan",
  "AI controls plan",
  "Let AI plan for you",
];

function primeApi() {
  mockGet.mockReset();
  mockGet.mockImplementation((path) => {
    if (path === "/api/study/plan") return Promise.resolve({ plan: null, tasks: [] });
    if (path === "/api/study/focus/summary")
      return Promise.resolve({ total_hours_7d: 0, week: [] });
    if (path === "/api/study/weekly-review") return Promise.resolve(null);
    if (path === "/api/study/exams") {
      return Promise.resolve({
        items: [{ id: EXAM_ID, name: "SSC CGL", planner_ready: true }],
      });
    }
    if (path === "/api/study/target-exam") {
      return Promise.resolve({
        selected_exam: { id: EXAM_ID, slug: "ssc-cgl", name: "SSC CGL", is_active: true },
      });
    }
    if (path === "/api/study/tracked-exams") {
      return Promise.resolve({
        items: [
          {
            id: EXAM_ID,
            slug: "ssc-cgl",
            name: "SSC CGL",
            is_active: true,
            planner_ready: true,
            is_primary: true,
          },
        ],
        primary_exam_id: EXAM_ID,
      });
    }
    if (path === "/api/study/plan/draft") {
      return Promise.resolve({
        generated: true,
        exam_name: "SSC CGL",
        risk_level: "low",
        before_tasks: [],
        after_tasks: [{ topic_id: "t1", title: "Quant · Number Systems" }],
        changes: { added: [], removed: [], added_count: 1, removed_count: 0, unchanged_count: 0 },
      });
    }
    return Promise.resolve({});
  });
}

afterEach(() => {
  mockGet.mockReset();
  mockPut.mockReset();
  mockPost.mockReset();
  mockDel.mockReset();
});

test("StudyPlan renders only deterministic-planner action labels", async () => {
  primeApi();

  await act(async () => {
    render(<StudyPlan />);
  });

  // Header buttons should be present after hydration.
  const regenBtn = await screen.findByTestId("regenerate-plan-btn");
  const suggestBtn = await screen.findByTestId("suggest-changes-btn");
  expect(regenBtn.textContent).toMatch(/Regenerate plan/);
  expect(suggestBtn.textContent).toMatch(/Suggest changes/);

  // Open the preview drawer to surface the remaining two approved labels.
  await act(async () => {
    fireEvent.click(regenBtn);
  });

  await waitFor(() => {
    expect(screen.getByTestId("apply-draft-btn")).toBeTruthy();
  });

  // All four approved labels are present in the rendered tree.
  for (const label of APPROVED_LABELS) {
    expect(
      screen.getAllByText((_, node) => {
        if (!node) return false;
        const text = node.textContent || "";
        return text.includes(label);
      }).length,
    ).toBeGreaterThan(0);
  }

  // None of the forbidden AI-authority strings may appear anywhere.
  const tree = document.body.textContent || "";
  for (const bad of FORBIDDEN_STRINGS) {
    expect(tree).not.toContain(bad);
  }
});
