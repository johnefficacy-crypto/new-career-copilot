import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";

const mockGet = jest.fn();
jest.mock("../../lib/api", () => ({
  __esModule: true,
  api: { get: (...args) => mockGet(...args), post: jest.fn() },
}));

import WeeklyReview from "./WeeklyReview";

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ scores: {} });
});

function renderAt(initial) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <WeeklyReview />
    </MemoryRouter>,
  );
}

describe("WeeklyReview ?period= parsing (PR10)", () => {
  test("?period=monthly opens with Monthly selected and fetches the monthly endpoint", async () => {
    renderAt("/app/study/review?period=monthly");
    expect(screen.getByText("Monthly Report Card")).toBeTruthy();
    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith("/api/study/report-card?period=monthly"),
    );
  });

  test("?period=daily opens with Daily selected", async () => {
    renderAt("/app/study/review?period=daily");
    expect(screen.getByText("Today's Report Card")).toBeTruthy();
    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith("/api/study/report-card?period=daily"),
    );
  });

  test("?period=weekly opens with Weekly selected (matches default)", async () => {
    renderAt("/app/study/review?period=weekly");
    expect(screen.getByText("Weekly Report Card")).toBeTruthy();
  });

  test("missing param keeps the existing default (Weekly)", async () => {
    renderAt("/app/study/review");
    expect(screen.getByText("Weekly Report Card")).toBeTruthy();
    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith("/api/study/report-card?period=weekly"),
    );
  });

  test("invalid param keeps the existing default", async () => {
    renderAt("/app/study/review?period=hourly");
    expect(screen.getByText("Weekly Report Card")).toBeTruthy();
  });
});
