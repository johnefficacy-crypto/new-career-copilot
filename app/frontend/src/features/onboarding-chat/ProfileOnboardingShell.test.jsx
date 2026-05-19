import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockSession = { status: "needs_auth_start" };

jest.mock("./useProfileOnboarding", () => ({
  useProfileOnboarding: () => ({
    status: mockSession.status,
    profile: null,
    question: null,
    completed: false,
    saving: false,
    error: null,
    submit: jest.fn(),
    skipAll: jest.fn(),
    reload: jest.fn(),
    isAnonymous: false,
    user: null,
  }),
}));

// StartFreeButton renders a Cloudflare Turnstile widget on mount which
// would try to load remote JS in the test env. Replace with a marker.
jest.mock("../../components/StartFreeButton", () => ({
  __esModule: true,
  default: ({ testId, label }) => (
    <button data-testid={testId} type="button">
      {label}
    </button>
  ),
}));

jest.mock("./GoogleLinkBanner", () => () => null);
jest.mock("./analytics", () => ({ trackOnboardingEvent: jest.fn() }));

beforeEach(() => {
  mockSession.status = "needs_auth_start";
});

test("renders StartFreeButton when status === needs_auth_start", () => {
  // eslint-disable-next-line global-require
  const ProfileOnboardingShell = require("./ProfileOnboardingShell").default;
  render(
    <MemoryRouter>
      <ProfileOnboardingShell />
    </MemoryRouter>,
  );

  expect(screen.getByTestId("onboarding-needs-auth-start")).toBeTruthy();
  expect(screen.getByTestId("onboarding-start-free")).toBeTruthy();
  expect(
    screen.getByText(/Secure check required before starting your free session/i),
  ).toBeTruthy();
  // The error state's "Try again" button must NOT render here.
  expect(screen.queryByText(/Try again/i)).toBeNull();
});

test("does not render StartFreeButton in error state", () => {
  mockSession.status = "error";
  // eslint-disable-next-line global-require
  const ProfileOnboardingShell = require("./ProfileOnboardingShell").default;
  render(
    <MemoryRouter>
      <ProfileOnboardingShell />
    </MemoryRouter>,
  );

  expect(screen.queryByTestId("onboarding-needs-auth-start")).toBeNull();
  expect(screen.queryByTestId("onboarding-start-free")).toBeNull();
  expect(screen.getByText(/Try again/i)).toBeTruthy();
});
