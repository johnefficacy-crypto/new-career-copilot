import React from "react";
import { render, screen, act, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockLogin = jest.fn();
const mockLoginWithGoogle = jest.fn();
const mockNavigate = jest.fn();

jest.mock("../../lib/authContext", () => ({
  __esModule: true,
  useAuth: () => ({
    login: mockLogin,
    loginWithGoogle: mockLoginWithGoogle,
  }),
}));

jest.mock("react-router-dom", () => {
  const actual = jest.requireActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

// Capture Turnstile callbacks like StartFreeButton.test does.
const mockExecute = jest.fn();
const mockReset = jest.fn();
const cbs = { onSuccess: null, onError: null, onExpire: null };
jest.mock("../../components/TurnstileWidget", () => {
  const ReactInner = require("react");
  return {
    __esModule: true,
    default: ReactInner.forwardRef((props, ref) => {
      cbs.onSuccess = props.onSuccess;
      cbs.onError = props.onError;
      cbs.onExpire = props.onExpire;
      ReactInner.useImperativeHandle(ref, () => ({
        execute: mockExecute,
        reset: mockReset,
        remove: jest.fn(),
      }));
      return null;
    }),
  };
});

const ORIGINAL_KEY = process.env.REACT_APP_TURNSTILE_SITE_KEY;

beforeEach(() => {
  mockLogin.mockReset();
  mockLoginWithGoogle.mockReset();
  mockNavigate.mockReset();
  mockExecute.mockReset();
  mockReset.mockReset();
  cbs.onSuccess = null;
  cbs.onError = null;
  cbs.onExpire = null;
  process.env.REACT_APP_TURNSTILE_SITE_KEY = "site-key";
});
afterEach(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.REACT_APP_TURNSTILE_SITE_KEY;
  } else {
    process.env.REACT_APP_TURNSTILE_SITE_KEY = ORIGINAL_KEY;
  }
});

// eslint-disable-next-line global-require
const Login = require("./Login").default;

function renderLogin(path = "/login") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Login />
    </MemoryRouter>,
  );
}

async function fillAndSubmit() {
  fireEvent.change(screen.getByTestId("login-email"), {
    target: { value: "u@x.com" },
  });
  fireEvent.change(screen.getByTestId("login-password"), {
    target: { value: "pw12345" },
  });
  await act(async () => {
    fireEvent.click(screen.getByTestId("login-submit"));
  });
}

test("submits captchaToken via auth.login", async () => {
  mockLogin.mockResolvedValue({ role: "user" });
  renderLogin();

  await fillAndSubmit();
  await waitFor(() => expect(mockExecute).toHaveBeenCalled());

  act(() => {
    cbs.onSuccess("captcha-A");
  });

  await waitFor(() => expect(mockLogin).toHaveBeenCalled());
  expect(mockLogin).toHaveBeenCalledWith("u@x.com", "pw12345", {
    captchaToken: "captcha-A",
  });
});

test("resets Turnstile after failed login", async () => {
  mockLogin.mockRejectedValue(new Error("wrong password"));
  renderLogin();

  await fillAndSubmit();
  await waitFor(() => expect(mockExecute).toHaveBeenCalled());
  act(() => {
    cbs.onSuccess("captcha-B");
  });
  await waitFor(() => expect(mockLogin).toHaveBeenCalled());
  await screen.findByTestId("login-error");
  expect(mockReset).toHaveBeenCalled();
});

test("widget load failure shows a user-facing message and does not hang", async () => {
  renderLogin();
  await fillAndSubmit();
  await waitFor(() => expect(mockExecute).toHaveBeenCalled());

  // Simulate Cloudflare error-callback firing before any token resolution.
  act(() => {
    cbs.onError("network");
  });

  // We should see the user-facing CAPTCHA failure copy.
  await screen.findByTestId("login-error");
  expect(mockLogin).not.toHaveBeenCalled();
});

test("renders ?error= banner from URL on mount", () => {
  renderLogin("/login?error=oauth_failed");
  expect(screen.getByTestId("login-banner-error").textContent).toMatch(/oauth_failed/);
});

test("Google button passes path-only redirectTo to loginWithGoogle", async () => {
  mockLoginWithGoogle.mockResolvedValue({ ok: true });
  renderLogin("/login?next=%2Fapp%2Fstudy%2Fplan");
  await act(async () => {
    fireEvent.click(screen.getByTestId("login-google"));
  });
  expect(mockLoginWithGoogle).toHaveBeenCalledWith({
    redirectTo: "/app/study/plan",
  });
});
