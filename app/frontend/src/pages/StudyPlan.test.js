import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";

const mockGet = jest.fn();
const mockPut = jest.fn();
const mockPost = jest.fn();

jest.mock("../lib/api", () => ({
  __esModule: true,
  api: {
    get: (...args) => mockGet(...args),
    put: (...args) => mockPut(...args),
    post: (...args) => mockPost(...args),
  },
}));

// Heavy children pull in their own data; stub them so this test stays focused
// on the hydration behavior of the exam picker.
jest.mock("../features/study/components/PlanChangeLogCard", () => () => null);
jest.mock("../features/study/components/PlanByTopic", () => () => null);
jest.mock("../features/study/components/ExamCycleTimeline", () => () => null);

jest.mock("../lib/hooks/useApiAction", () => ({
  __esModule: true,
  default: () => ({ run: jest.fn() }),
}));

import StudyPlan from "./StudyPlan";

const EXAM_ID = "11111111-1111-4111-8111-111111111111";

function setupApi({ selectedExam } = {}) {
  mockGet.mockReset();
  mockGet.mockImplementation((path) => {
    if (path === "/api/study/plan") return Promise.resolve({ plan: null, tasks: [] });
    if (path === "/api/study/focus/summary") return Promise.resolve({ total_hours_7d: 0, week: [] });
    if (path === "/api/study/weekly-review") return Promise.resolve(null);
    if (path === "/api/study/exams") {
      return Promise.resolve({
        items: [
          { id: EXAM_ID, name: "SSC CGL", planner_ready: true },
          { id: "22222222-2222-4222-8222-222222222222", name: "UPSC CSE", planner_ready: false },
        ],
      });
    }
    if (path === "/api/study/target-exam") return Promise.resolve({ selected_exam: selectedExam });
    return Promise.resolve({});
  });
}

afterEach(() => {
  mockGet.mockReset();
  mockPut.mockReset();
  mockPost.mockReset();
});

test("hydrates selectedExamId from GET /api/study/target-exam on mount", async () => {
  setupApi({
    selectedExam: { id: EXAM_ID, slug: "ssc-cgl", name: "SSC CGL", is_active: true },
  });

  await act(async () => {
    render(<StudyPlan />);
  });

  // Once hydration resolves, the "Choose your exam" empty-state copy must
  // disappear and the hydrated exam button must render as the primary one.
  await waitFor(() => {
    expect(screen.queryByText(/Choose the exam you are preparing for\./i)).toBeNull();
  });
  const sscButton = screen.getByRole("button", { name: /SSC CGL/i });
  expect(sscButton.className).toMatch(/btn-primary/);
  // Confirm the hydration call actually fired.
  expect(mockGet).toHaveBeenCalledWith("/api/study/target-exam");
});

test("keeps empty state when no target exam is stored", async () => {
  setupApi({ selectedExam: null });

  await act(async () => {
    render(<StudyPlan />);
  });

  await waitFor(() => {
    expect(screen.getByText(/Choose the exam you are preparing for\./i)).toBeTruthy();
  });
});
