import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const mockUseAuth = jest.fn();
jest.mock("./authContext", () => ({
  __esModule: true,
  useAuth: () => mockUseAuth(),
}));

// eslint-disable-next-line global-require
const { GuestOnly } = require("./ProtectedRoute");

function Login() {
  return <div data-testid="login-page">login</div>;
}
function Marker({ id }) {
  return <div data-testid={id}>landed</div>;
}

function mountLogin(entries) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <Routes>
        <Route
          path="/login"
          element={
            <GuestOnly>
              <Login />
            </GuestOnly>
          }
        />
        <Route path="/app" element={<Marker id="app" />} />
        <Route path="/app/study/plan" element={<Marker id="study-plan" />} />
        <Route path="/app/profile" element={<Marker id="profile" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockUseAuth.mockReset();
});

test("guest sees the wrapped login page", () => {
  mockUseAuth.mockReturnValue({ isAuthed: false, isChecking: false });
  mountLogin(["/login"]);
  expect(screen.getByTestId("login-page")).toBeTruthy();
});

test("authed user with ?next= is redirected there", () => {
  mockUseAuth.mockReturnValue({ isAuthed: true, isChecking: false });
  mountLogin(["/login?next=%2Fapp%2Fstudy%2Fplan"]);
  expect(screen.getByTestId("study-plan")).toBeTruthy();
});

test("authed user with unsafe ?next= falls back to /app", () => {
  mockUseAuth.mockReturnValue({ isAuthed: true, isChecking: false });
  mountLogin(["/login?next=%2F%2Fevil.com"]);
  expect(screen.getByTestId("app")).toBeTruthy();
});

test("authed user with state.from path is redirected there", () => {
  mockUseAuth.mockReturnValue({ isAuthed: true, isChecking: false });
  render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: "/login",
          state: { from: { pathname: "/app/profile", search: "" } },
        },
      ]}
    >
      <Routes>
        <Route
          path="/login"
          element={
            <GuestOnly>
              <Login />
            </GuestOnly>
          }
        />
        <Route path="/app/profile" element={<Marker id="profile" />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByTestId("profile")).toBeTruthy();
});

test("checking state renders loader, no redirect yet", () => {
  mockUseAuth.mockReturnValue({ isAuthed: false, isChecking: true });
  mountLogin(["/login?next=%2Fapp%2Fstudy%2Fplan"]);
  expect(screen.getByTestId("auth-checking")).toBeTruthy();
});
