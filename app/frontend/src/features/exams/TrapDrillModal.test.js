import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

jest.mock("../../lib/api", () => {
  const get = jest.fn();
  return { __esModule: true, api: { get } };
});

import { api } from "../../lib/api";
import TrapDrillModal from "./TrapDrillModal";

afterEach(() => {
  api.get.mockReset();
});

function _drillPayload({ withInsights = true } = {}) {
  return {
    verified_only: true,
    total_pool_size: 3,
    trap_annotated_pool_size: 2,
    questions: [
      {
        id: "q1",
        question_text: "Pick the right one.",
        year: 2023,
        correct_option_id: "o-q1-A",
        options: [
          { id: "o-q1-A", label: "A", text: "Correct answer" },
          { id: "o-q1-B", label: "B", text: "Wrong answer" },
        ],
        trap_insights: withInsights
          ? [
              {
                option_id: "o-q1-B",
                pattern_type: "common_trap",
                note: "Commonly-chosen wrong answer. Reused ×4 across PYQs.",
              },
            ]
          : [],
      },
      {
        id: "q2",
        question_text: "Second question.",
        year: 2024,
        correct_option_id: "o-q2-A",
        options: [
          { id: "o-q2-A", label: "A", text: "Right pick" },
          { id: "o-q2-B", label: "B", text: "Distractor" },
        ],
        trap_insights: [],
      },
    ],
  };
}

test("does not render when closed", () => {
  const { container } = render(
    <TrapDrillModal open={false} onClose={() => {}} examSlug="upsc-cse" />
  );
  expect(container.firstChild).toBeNull();
  expect(api.get).not.toHaveBeenCalled();
});

test("opens, loads, and plays through to summary", async () => {
  api.get.mockResolvedValueOnce(_drillPayload());
  render(
    <TrapDrillModal open onClose={() => {}} examSlug="upsc-cse" size={2} />
  );

  // Loading first, then question 1.
  await waitFor(() => screen.getByTestId("trap-drill-question"));
  expect(screen.getByText("Pick the right one.")).toBeTruthy();
  expect(screen.getByText(/Question 1 of 2/)).toBeTruthy();

  // Pick the wrong answer — trap insight should surface.
  fireEvent.click(screen.getByTestId("drill-option-B"));
  expect(screen.getByText(/Commonly-chosen wrong answer/)).toBeTruthy();

  // Advance to question 2.
  fireEvent.click(screen.getByTestId("trap-drill-next"));
  expect(screen.getByText("Second question.")).toBeTruthy();

  // Pick correctly, finish.
  fireEvent.click(screen.getByTestId("drill-option-A"));
  fireEvent.click(screen.getByTestId("trap-drill-next"));
  await waitFor(() => screen.getByTestId("trap-drill-summary"));
  expect(screen.getByText(/1 of 2 correct/)).toBeTruthy();
});

test("renders empty summary when no questions returned", async () => {
  api.get.mockResolvedValueOnce({
    verified_only: true,
    questions: [],
    total_pool_size: 0,
    trap_annotated_pool_size: 0,
  });
  render(<TrapDrillModal open onClose={() => {}} examSlug="upsc-cse" />);
  await waitFor(() => screen.getByTestId("trap-drill-empty"));
  expect(
    screen.getByText(/doesn't have verified PYQs ready for a drill yet/i)
  ).toBeTruthy();
});

test("surfaces error state when api rejects", async () => {
  api.get.mockRejectedValueOnce(new Error("boom"));
  render(<TrapDrillModal open onClose={() => {}} examSlug="upsc-cse" />);
  await waitFor(() => screen.getByTestId("trap-drill-error"));
  expect(screen.getByText(/Couldn't load the drill/i)).toBeTruthy();
});

test("passes topic_id and size as query params", async () => {
  api.get.mockResolvedValueOnce(_drillPayload());
  render(
    <TrapDrillModal
      open
      onClose={() => {}}
      examSlug="upsc-cse"
      topicId="t-polity"
      size={3}
    />
  );
  await waitFor(() =>
    expect(api.get).toHaveBeenCalledWith(
      "/api/exam-intelligence/exams/upsc-cse/trap-drill?topic_id=t-polity&size=3"
    )
  );
});

test("Escape key closes the modal", async () => {
  const onClose = jest.fn();
  api.get.mockResolvedValueOnce(_drillPayload());
  render(<TrapDrillModal open onClose={onClose} examSlug="upsc-cse" />);
  await waitFor(() => screen.getByTestId("trap-drill-question"));
  act(() => {
    fireEvent.keyDown(document, { key: "Escape" });
  });
  expect(onClose).toHaveBeenCalled();
});

test("backdrop click closes the modal but inner click does not", async () => {
  const onClose = jest.fn();
  api.get.mockResolvedValueOnce(_drillPayload());
  render(<TrapDrillModal open onClose={onClose} examSlug="upsc-cse" />);
  await waitFor(() => screen.getByTestId("trap-drill-question"));
  fireEvent.click(screen.getByTestId("trap-drill-modal"));
  expect(onClose).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByTestId("trap-drill-question"));
  expect(onClose).toHaveBeenCalledTimes(1);
});
