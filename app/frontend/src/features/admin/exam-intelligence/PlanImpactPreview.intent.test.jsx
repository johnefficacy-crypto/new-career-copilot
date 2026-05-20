import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock("../../../lib/api", () => ({
  __esModule: true,
  api: {
    get: (...a) => mockGet(...a),
    post: (...a) => mockPost(...a),
  },
}));

// eslint-disable-next-line global-require
const PlanImpactPreview = require("./PlanImpactPreview").default;

const IMPACT = {
  candidate_topic: "Percentage",
  candidate_topic_id: "t1",
  summary: "Adds one high-yield topic",
  risk_level: "low",
  before: [],
  after: [{ topic_id: "t1", topic: "Percentage", rank: 1, exam_level_score: 88, high_yield: true }],
  changes: [],
  affected_topic_count: 0,
  latest_decision: null,
};

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  // candidates load, then impact load.
  mockGet.mockImplementation((url) => {
    if (url.includes("/topic-coverage")) {
      return Promise.resolve({ items: [{ id: "cov-1", exam: "SSC CGL", topic: "Percentage" }] });
    }
    if (url.includes("/plan-impact/")) {
      return Promise.resolve(IMPACT);
    }
    return Promise.resolve({});
  });
  mockPost.mockResolvedValue({ decision: "approve" });
});

test("approve action is labelled as intent, never as a lock", async () => {
  render(<PlanImpactPreview />);
  // Select the candidate to load impact.
  await waitFor(() => expect(screen.getByRole("combobox")).toBeTruthy());
  await act(async () => {
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "cov-1" } });
  });
  await screen.findByTestId("plan-impact-save-decision");

  // The decision button must read "Record approval intent", never the old
  // "Approve for Study OS" lock-implying copy.
  expect(screen.getByText("Record approval intent")).toBeTruthy();
  expect(screen.queryByText("Approve for Study OS")).toBeNull();
});

test("save never renders 'coverage row locked' copy", async () => {
  render(<PlanImpactPreview />);
  await waitFor(() => expect(screen.getByRole("combobox")).toBeTruthy());
  await act(async () => {
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "cov-1" } });
  });
  await screen.findByTestId("plan-impact-save-decision");

  await act(async () => {
    fireEvent.click(screen.getByTestId("plan-impact-save-decision"));
  });

  await waitFor(() => expect(mockPost).toHaveBeenCalled());
  // The success message must communicate intent-only, never a lock.
  await waitFor(() =>
    expect(screen.getByText(/intent only — row remains unlocked/i)).toBeTruthy(),
  );
  expect(screen.queryByText(/locked into the planner/i)).toBeNull();
});
