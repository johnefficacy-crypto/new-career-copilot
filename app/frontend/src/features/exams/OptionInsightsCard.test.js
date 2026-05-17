import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

jest.mock("../../lib/api", () => {
  const get = jest.fn();
  return { __esModule: true, api: { get } };
});

import { api } from "../../lib/api";
import OptionInsightsCard from "./OptionInsightsCard";

afterEach(() => {
  api.get.mockReset();
});

test("renders nothing when no exam slug provided", () => {
  const { container } = render(<OptionInsightsCard examSlug={null} />);
  expect(container.firstChild).toBeNull();
  expect(api.get).not.toHaveBeenCalled();
});

test("renders empty-state copy when has_data is false", async () => {
  api.get.mockResolvedValueOnce({
    has_data: false,
    recurring_distractors: [],
    elimination_tips: [],
  });
  render(<OptionInsightsCard examSlug="upsc-cse" />);
  await waitFor(() => screen.getByTestId("option-insights-card"));
  expect(
    screen.getByText(/No trap-awareness insights ready yet/i)
  ).toBeTruthy();
});

test("renders distractor and elimination tips when data present", async () => {
  api.get.mockResolvedValueOnce({
    has_data: true,
    recurring_distractors: [
      {
        normalized_value: "1 only",
        occurrence_count: 4,
        first_seen_year: 2019,
        last_seen_year: 2024,
        wrong_count: 4,
        correct_count: 0,
        tip: "Examiners reused “1 only” 4× as a distractor — almost always wrong.",
      },
    ],
    elimination_tips: [
      {
        pattern: "all_of_the_above",
        display_text: "All of the above",
        occurrence_count: 12,
        correct_count: 3,
        wrong_count: 9,
        correct_rate: 0.25,
        tip: "“All of the above” shows up 12× — correct only 25% of the time.",
      },
    ],
  });
  render(<OptionInsightsCard examSlug="upsc-cse" />);
  await waitFor(() => screen.getByTestId("distractor-list"));
  expect(screen.getByText("1 only")).toBeTruthy();
  expect(screen.getByText(/almost always wrong/i)).toBeTruthy();
  expect(screen.getByText("All of the above")).toBeTruthy();
  expect(screen.getByText("25% correct · ×12")).toBeTruthy();
});

test("passes topic_id query param when supplied", async () => {
  api.get.mockResolvedValueOnce({
    has_data: false,
    recurring_distractors: [],
    elimination_tips: [],
  });
  render(<OptionInsightsCard examSlug="upsc-cse" topicId="t1" />);
  await waitFor(() =>
    expect(api.get).toHaveBeenCalledWith(
      "/api/exam-intelligence/exams/upsc-cse/option-insights?topic_id=t1"
    )
  );
});

test("surfaces error state when api rejects", async () => {
  api.get.mockRejectedValueOnce(new Error("boom"));
  render(<OptionInsightsCard examSlug="upsc-cse" />);
  await waitFor(() => screen.getByTestId("option-insights-error"));
  expect(screen.getByText(/Couldn't load trap-awareness tips/i)).toBeTruthy();
});
