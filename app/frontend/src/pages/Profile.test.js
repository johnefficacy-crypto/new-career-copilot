import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";

jest.mock("../lib/api", () => {
  const get = jest.fn();
  const put = jest.fn();
  return { __esModule: true, api: { get, put } };
});

jest.mock("../lib/authContext", () => ({
  __esModule: true,
  useAuth: () => ({ user: null, setUser: () => {} }),
}));

jest.mock("../features/profile/hooks/useProfileData", () => ({
  __esModule: true,
  default: jest.fn(),
}));

import useProfileData from "../features/profile/hooks/useProfileData";
import Profile from "./Profile";

function setProfileState(overrides) {
  useProfileData.mockReturnValue({
    form: {},
    setForm: () => {},
    completion: {},
    setCompletion: () => {},
    certs: [],
    setCerts: () => {},
    expRows: [],
    setExpRows: () => {},
    attemptRows: [],
    setAttemptRows: () => {},
    certRegistry: [],
    newCert: { certification_name: "", issuing_body: "", year_completed: "" },
    setNewCert: () => {},
    newExp: { sector: "", role: "", organization: "", start_date: "", end_date: "" },
    setNewExp: () => {},
    newAttempt: { exam_id: "", attempts_used: 0 },
    setNewAttempt: () => {},
    loading: false,
    error: null,
    reload: () => {},
    optionalErrors: {},
    ...overrides,
  });
}

afterEach(() => {
  useProfileData.mockReset();
});

test("renders the missing-fields setup header when overall completion < 100", () => {
  setProfileState({
    completion: {
      identity_profile: {
        completion_pct: 50,
        missing_fields: ["date_of_birth", "gender"],
      },
      education_profile: { completion_pct: 80, missing_fields: ["qualification"] },
      preferences_profile: { completion_pct: 100, missing_fields: [] },
      study_profile: { completion_pct: 100, missing_fields: [] },
      application_profile: { completion_pct: 100, missing_fields: [] },
    },
  });

  render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>,
  );

  const header = screen.getByTestId("profile-progressive-header");
  expect(header.textContent).toMatch(/% complete/);
  expect(header.textContent).toMatch(/3 eligibility-blocking fields still missing/);
  expect(screen.getByTestId("profile-continue-setup")).toBeTruthy();
});

test("does not render the missing-fields card when completion is 100%", () => {
  setProfileState({
    completion: {
      identity_profile: { completion_pct: 100, missing_fields: [] },
      education_profile: { completion_pct: 100, missing_fields: [] },
      preferences_profile: { completion_pct: 100, missing_fields: [] },
      study_profile: { completion_pct: 100, missing_fields: [] },
      application_profile: { completion_pct: 100, missing_fields: [] },
    },
  });

  render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>,
  );

  expect(screen.queryByTestId("profile-progressive-header")).toBeNull();
  expect(screen.queryByTestId("profile-continue-setup")).toBeNull();
});

test("renders core profile even when optional sections fail", () => {
  setProfileState({
    optionalErrors: { certifications: new Error("timeout") },
    completion: {
      identity_profile: { completion_pct: 100, missing_fields: [] },
      education_profile: { completion_pct: 100, missing_fields: [] },
      preferences_profile: { completion_pct: 100, missing_fields: [] },
      study_profile: { completion_pct: 100, missing_fields: [] },
      application_profile: { completion_pct: 100, missing_fields: [] },
    },
  });
  render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>,
  );
  expect(screen.getByTestId("profile-page")).toBeTruthy();
  expect(screen.getByText(/Unable to load saved certifications/i)).toBeTruthy();
});
