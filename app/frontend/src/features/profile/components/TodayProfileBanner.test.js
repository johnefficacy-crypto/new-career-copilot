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
  expect(screen.getByTestId("today-profile-banner-cta")).toBeTruthy();
  expect(screen.queryByTestId("today-profile-banner-dismiss")).toBeNull();
});

test("renders dismissable banner when 50% ≤ completion < 80%", () => {
  mockUseProfileCompletion.mockReturnValue({ pct: 65, status: "amber", loading: false, error: null });
  renderBanner();
  const banner = screen.getByTestId("today-profile-banner");
  expect(banner.getAttribute("data-tone")).toBe("amber");
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

test("approved copy is present and forbidden copy is absent", () => {
  mockUseProfileCompletion.mockReturnValue({ pct: 42, status: "red", loading: false, error: null });
  renderBanner();
  const banner = screen.getByTestId("today-profile-banner");
  // Approved
  expect(banner.textContent).toMatch(/Continue setup/);
  expect(banner.textContent).toMatch(/Picks up where you left off\./);
  // Forbidden
  expect(banner.textContent).not.toMatch(/first field you left blank/i);
  expect(banner.textContent).not.toMatch(/Complete your profile/i);
  expect(banner.textContent).not.toMatch(/sharpen your matches/i);
  expect(banner.textContent).not.toMatch(/eligibility kicks in/i);
});

test("a11y: region, CTA, and dismiss expose the documented aria-labels", () => {
  mockUseProfileCompletion.mockReturnValue({ pct: 65, status: "amber", loading: false, error: null });
  renderBanner();
  const banner = screen.getByTestId("today-profile-banner");
  expect(banner.getAttribute("role")).toBe("region");
  expect(banner.getAttribute("aria-label")).toBe("Profile setup reminder");

  const cta = screen.getByTestId("today-profile-banner-cta");
  expect(cta.getAttribute("aria-label")).toBe("Continue profile setup, 65% complete");

  const dismiss = screen.getByTestId("today-profile-banner-dismiss");
  expect(dismiss.getAttribute("aria-label")).toBe("Dismiss profile reminder for 7 days");
});

test("CTA links to /app/onboarding with no query params", () => {
  mockUseProfileCompletion.mockReturnValue({ pct: 30, status: "red", loading: false, error: null });
  renderBanner();
  const cta = screen.getByTestId("today-profile-banner-cta");
  expect(cta.getAttribute("href")).toBe("/app/onboarding");
});

test("amber banner reappears 7 days + 1 hour after dismissal", () => {
  const past = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000)).toISOString();
  window.localStorage.setItem("today.profileBanner.dismissedAt", past);
  mockUseProfileCompletion.mockReturnValue({ pct: 70, status: "amber", loading: false, error: null });
  renderBanner();
  expect(screen.getByTestId("today-profile-banner")).toBeTruthy();
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
