import React from "react";
import { render, screen, act, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockRegister = jest.fn();
const mockLoginWithGoogle = jest.fn();
const mockNavigate = jest.fn();

jest.mock("../../lib/authContext", () => ({
  __esModule: true,
  useAuth: () => ({
    register: mockRegister,
    loginWithGoogle: mockLoginWithGoogle,
  }),
}));

jest.mock("react-router-dom", () => {
  const actual = jest.requireActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

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
  mockRegister.mockReset();
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
const Signup = require("./Signup").default;

function renderSignup(path = "/signup") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Signup />
    </MemoryRouter>,
  );
}

async function fillAndSubmit() {
  fireEvent.change(screen.getByTestId("signup-name"), {
    target: { value: "Alice" },
  });
  fireEvent.change(screen.getByTestId("signup-email"), {
    target: { value: "a@x.com" },
  });
  fireEvent.change(screen.getByTestId("signup-password"), {
    target: { value: "pw12345" },
  });
  await act(async () => {
    fireEvent.click(screen.getByTestId("signup-submit"));
  });
}

test("submits captchaToken via auth.register", async () => {
  mockRegister.mockResolvedValue({
    user: { id: "u1" },
    needsEmailConfirmation: false,
  });
  renderSignup();

  await fillAndSubmit();
  await waitFor(() => expect(mockExecute).toHaveBeenCalled());
  act(() => {
    cbs.onSuccess("cap-tok");
  });

  await waitFor(() => expect(mockRegister).toHaveBeenCalled());
  expect(mockRegister).toHaveBeenCalledWith({
    email: "a@x.com",
    password: "pw12345",
    name: "Alice",
    captchaToken: "cap-tok",
  });
});

test("resets Turnstile after register failure", async () => {
  mockRegister.mockRejectedValue(new Error("user exists"));
  renderSignup();

  await fillAndSubmit();
  await waitFor(() => expect(mockExecute).toHaveBeenCalled());
  act(() => {
    cbs.onSuccess("cap-tok-2");
  });
  await screen.findByTestId("signup-error");
  expect(mockReset).toHaveBeenCalled();
});

test("renders ?error= banner from URL on mount", () => {
  renderSignup("/signup?error=signup_failed");
  expect(screen.getByTestId("signup-banner-error").textContent).toMatch(
    /signup_failed/,
  );
});

test("Google button uses path-only redirectTo", async () => {
  mockLoginWithGoogle.mockResolvedValue({ ok: true });
  renderSignup("/signup?next=%2Fapp%2Fstudy%2Fplan");
  await act(async () => {
    fireEvent.click(screen.getByTestId("signup-google"));
  });
  expect(mockLoginWithGoogle).toHaveBeenCalledWith({
    redirectTo: "/app/study/plan",
  });
});

test("shows check-email panel when register reports needsEmailConfirmation", async () => {
  mockRegister.mockResolvedValue({
    user: { id: "u9" },
    needsEmailConfirmation: true,
  });
  renderSignup();
  await fillAndSubmit();
  await waitFor(() => expect(mockExecute).toHaveBeenCalled());
  act(() => {
    cbs.onSuccess("cap-tok");
  });
  await screen.findByTestId("signup-check-email");
  expect(mockNavigate).not.toHaveBeenCalled();
});
