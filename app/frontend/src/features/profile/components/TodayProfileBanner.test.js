import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent } from "@testing-library/react";

const mockUseProfileCompletion = jest.fn();

jest.mock("../hooks/useProfileCompletion", () => ({
  __esModule: true,
  default: (...args) => mockUseProfileCompletion(...args),
  classifyCompletion: (pct) => (pct >= 80 ? "green" : pct >= 50 ? "amber" : "red"),
  PROFILE_COMPLETION_QUERY_KEY: ["profile-completion"],
}));

import TodayProfileBanner from "./TodayProfileBanner";

function renderBanner() {
  return render(
    <MemoryRouter>
      <TodayProfileBanner />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockUseProfileCompletion.mockReset();
  window.localStorage.clear();
});

test("renders persistent (non-dismissable) banner when completion < 50%", () => {
  mockUseProfileCompletion.mockReturnValue({ pct: 30, status: "red", loading: false, error: null });
  renderBanner();
  const banner = screen.getByTestId("today-profile-banner");
  expect(banner.getAttribute("data-tone")).toBe("red");
  expect(banner.textContent).toMatch(/30% complete/);
  expect(screen.getByTestId("today-profile-banner-cta")).toBeTruthy();
  expect(screen.queryByTestId("today-profile-banner-dismiss")).toBeNull();
});

test("renders dismissable banner when 50% ≤ completion < 80%", () => {
  mockUseProfileCompletion.mockReturnValue({ pct: 65, status: "amber", loading: false, error: null });
  renderBanner();
  const banner = screen.getByTestId("today-profile-banner");
  expect(banner.getAttribute("data-tone")).toBe("amber");
  expect(banner.textContent).toMatch(/65% complete/);
  expect(screen.getByTestId("today-profile-banner-dismiss")).toBeTruthy();
});

test("hides banner entirely when completion ≥ 80%", () => {
  mockUseProfileCompletion.mockReturnValue({ pct: 92, status: "green", loading: false, error: null });
  renderBanner();
  expect(screen.queryByTestId("today-profile-banner")).toBeNull();
});

test("dismiss button hides banner and writes ISO timestamp to localStorage", () => {
  mockUseProfileCompletion.mockReturnValue({ pct: 70, status: "amber", loading: false, error: null });
  renderBanner();
  fireEvent.click(screen.getByTestId("today-profile-banner-dismiss"));
  expect(screen.queryByTestId("today-profile-banner")).toBeNull();
  const raw = window.localStorage.getItem("today.profileBanner.dismissedAt");
  expect(raw).toBeTruthy();
  expect(Number.isFinite(Date.parse(raw))).toBe(true);
});

test("amber banner stays hidden when localStorage dismissal is fresh (< 7 days)", () => {
  // 2 days ago
  const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  window.localStorage.setItem("today.profileBanner.dismissedAt", recent);
  mockUseProfileCompletion.mockReturnValue({ pct: 70, status: "amber", loading: false, error: null });
  renderBanner();
  expect(screen.queryByTestId("today-profile-banner")).toBeNull();
});

test("amber banner reappears once dismissal is older than 7 days", () => {
  // 8 days ago
  const stale = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  window.localStorage.setItem("today.profileBanner.dismissedAt", stale);
  mockUseProfileCompletion.mockReturnValue({ pct: 70, status: "amber", loading: false, error: null });
  renderBanner();
  expect(screen.getByTestId("today-profile-banner")).toBeTruthy();
});

test("red (persistent) banner ignores localStorage dismissal", () => {
  const recent = new Date(Date.now() - 1 * 60 * 1000).toISOString();
  window.localStorage.setItem("today.profileBanner.dismissedAt", recent);
  mockUseProfileCompletion.mockReturnValue({ pct: 30, status: "red", loading: false, error: null });
  renderBanner();
  expect(screen.getByTestId("today-profile-banner")).toBeTruthy();
  expect(screen.queryByTestId("today-profile-banner-dismiss")).toBeNull();
});

test("hides while loading and on error rather than flashing a tone", () => {
  mockUseProfileCompletion.mockReturnValue({ pct: 0, status: "red", loading: true, error: null });
  const { rerender } = renderBanner();
  expect(screen.queryByTestId("today-profile-banner")).toBeNull();

  mockUseProfileCompletion.mockReturnValue({ pct: 0, status: "red", loading: false, error: new Error("net") });
  rerender(
    <MemoryRouter>
      <TodayProfileBanner />
    </MemoryRouter>,
  );
  expect(screen.queryByTestId("today-profile-banner")).toBeNull();
});
