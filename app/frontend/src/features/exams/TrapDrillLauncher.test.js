import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

jest.mock("../../lib/api", () => {
  const get = jest.fn();
  const post = jest.fn(() => Promise.resolve({}));
  return { __esModule: true, api: { get, post } };
});

import { api } from "../../lib/api";
import TrapDrillLauncher from "./TrapDrillLauncher";

const EMPTY_STREAK = {
  current_streak_days: 0,
  longest_streak_days: 0,
  drills_this_week: 0,
  total_attempts: 0,
};

function _routeMock(streak = EMPTY_STREAK, drill = null) {
  api.get.mockImplementation((path) => {
    if (path.endsWith("/trap-drill/streak")) return Promise.resolve(streak);
    if (path.includes("/trap-drill")) return Promise.resolve(drill || {
      verified_only: true,
      questions: [],
      total_pool_size: 0,
      trap_annotated_pool_size: 0,
      drill_seed: 4242,
    });
    return Promise.resolve({});
  });
}

beforeEach(() => {
  // Reset the URL between tests so deep-link state doesn't bleed.
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  api.get.mockReset();
  api.post.mockClear();
});

test("renders nothing without an exam slug", () => {
  _routeMock();
  const { container } = render(<TrapDrillLauncher examSlug={null} />);
  expect(container.firstChild).toBeNull();
});

test("renders launcher card with default size in heading", async () => {
  _routeMock();
  render(<TrapDrillLauncher examSlug="upsc-cse" />);
  expect(screen.getByTestId("trap-drill-launcher")).toBeTruthy();
  expect(screen.getByText(/Run a 5-question trap-awareness drill/)).toBeTruthy();
  // Streak fetch fires on mount; let it resolve before the test ends.
  await waitFor(() =>
    expect(api.get).toHaveBeenCalledWith(
      "/api/exam-intelligence/exams/upsc-cse/trap-drill/streak"
    )
  );
});

test("clicking Start drill opens the modal and fires the fetch", async () => {
  _routeMock();
  render(<TrapDrillLauncher examSlug="upsc-cse" topicId="t1" size={3} />);
  fireEvent.click(screen.getByTestId("trap-drill-start"));
  await waitFor(() => screen.getByTestId("trap-drill-modal"));
  expect(api.get).toHaveBeenCalledWith(
    "/api/exam-intelligence/exams/upsc-cse/trap-drill?topic_id=t1&size=3"
  );
});

test("renders streak badge when current_streak_days > 0", async () => {
  _routeMock({
    current_streak_days: 4,
    longest_streak_days: 6,
    drills_this_week: 3,
    total_attempts: 19,
  });
  render(<TrapDrillLauncher examSlug="upsc-cse" />);
  await waitFor(() => screen.getByTestId("trap-drill-streak"));
  expect(screen.getByText(/4-day streak/)).toBeTruthy();
  expect(screen.getByText(/3 this week/)).toBeTruthy();
});

test("topicId in props mentions the scoping in body copy", async () => {
  _routeMock();
  render(<TrapDrillLauncher examSlug="upsc-cse" topicId="t-polity" />);
  await waitFor(() => screen.getByTestId("trap-drill-launcher"));
  expect(screen.getByText(/Scoped to the topic you've selected above/i)).toBeTruthy();
});

test("?drill_seed=N in URL auto-opens the modal and forwards the seed", async () => {
  window.history.replaceState({}, "", "/?drill_seed=99");
  _routeMock(EMPTY_STREAK, {
    verified_only: true,
    questions: [],
    total_pool_size: 0,
    trap_annotated_pool_size: 0,
    drill_seed: 99,
  });
  render(<TrapDrillLauncher examSlug="upsc-cse" />);
  await waitFor(() => screen.getByTestId("trap-drill-modal"));
  // The drill fetch should carry the seed forward.
  expect(api.get).toHaveBeenCalledWith(
    "/api/exam-intelligence/exams/upsc-cse/trap-drill?size=5&seed=99"
  );
});
