import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";

const mockGet = jest.fn();
jest.mock("../../lib/api", () => ({
  __esModule: true,
  api: { get: (...args) => mockGet(...args), post: jest.fn() },
}));

import StudyLearningHub from "./StudyLearningHub";
import StudyProgressHub from "./StudyProgressHub";

beforeEach(() => {
  mockGet.mockReset();
});

function renderAt(El) {
  return render(
    <MemoryRouter>
      <El />
    </MemoryRouter>,
  );
}

describe("StudyLearningHub (PR10)", () => {
  test("renders six live cards over the existing direct routes", () => {
    mockGet.mockResolvedValue({ items: [] });
    renderAt(StudyLearningHub);
    expect(screen.getByTestId("learning-card-notes").getAttribute("href")).toBe("/app/notes");
    expect(screen.getByTestId("learning-card-flashcards").getAttribute("href")).toBe("/app/flashcards");
    expect(screen.getByTestId("learning-card-revision").getAttribute("href")).toBe("/app/study/revision");
    expect(screen.getByTestId("learning-card-mocks").getAttribute("href")).toBe("/app/study/mocks");
    expect(screen.getByTestId("learning-card-mistakes").getAttribute("href")).toBe("/app/study/mistakes");
    expect(screen.getByTestId("learning-card-subjects").getAttribute("href")).toBe("/app/study/subjects");
  });

  test("Reminders is a disabled card — no href, no onClick, aria-disabled, tabIndex=-1", () => {
    mockGet.mockResolvedValue({ items: [] });
    renderAt(StudyLearningHub);
    const reminders = screen.getByTestId("disabled-card");
    expect(reminders.getAttribute("aria-disabled")).toBe("true");
    expect(reminders.getAttribute("tabindex")).toBe("-1");
    expect(reminders.tagName.toLowerCase()).not.toBe("a");
  });

  test("Exam intelligence routes to the tracked-primary slug when one exists", async () => {
    mockGet.mockResolvedValue({
      items: [
        { slug: "ssc-cgl-2026", is_primary: true },
        { slug: "rrb-2026", is_primary: false },
      ],
    });
    renderAt(StudyLearningHub);
    await waitFor(() =>
      expect(screen.getByTestId("learning-card-exam-intelligence").getAttribute("href")).toBe(
        "/app/eligibility/exams/ssc-cgl-2026#intelligence",
      ),
    );
  });

  test("Exam intelligence routes to catalogue when no tracked exam is set", async () => {
    mockGet.mockResolvedValue({ items: [] });
    renderAt(StudyLearningHub);
    await waitFor(() =>
      expect(screen.getByTestId("learning-card-exam-intelligence").getAttribute("href")).toBe(
        "/app/eligibility/exams",
      ),
    );
    expect(screen.getByText(/Choose an exam to view intelligence/)).toBeTruthy();
  });

  test("Exam intelligence stays clickable while loading (never dead text)", () => {
    // Don't resolve — leave it in flight.
    mockGet.mockReturnValue(new Promise(() => {}));
    renderAt(StudyLearningHub);
    const card = screen.getByTestId("learning-card-exam-intelligence");
    expect(card.tagName.toLowerCase()).toBe("a");
    expect(card.getAttribute("href")).toBeTruthy();
  });
});

describe("StudyProgressHub (PR10)", () => {
  test("renders four live cards with the expected destinations", () => {
    renderAt(StudyProgressHub);
    expect(screen.getByTestId("progress-card-report-card").getAttribute("href")).toBe("/app/study/review");
    expect(screen.getByTestId("progress-card-compare-effort").getAttribute("href")).toBe("/app/study/compare");
    expect(screen.getByTestId("progress-card-reports").getAttribute("href")).toBe("/app/reports");
    expect(screen.getByTestId("progress-card-monthly-review").getAttribute("href")).toBe(
      "/app/study/review?period=monthly",
    );
  });

  test("no disabled card on the Progress hub", () => {
    renderAt(StudyProgressHub);
    expect(screen.queryByTestId("disabled-card")).toBeNull();
  });
});
