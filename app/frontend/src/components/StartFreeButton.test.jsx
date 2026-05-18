import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockSignInAnonymously = jest.fn();
const mockNavigate = jest.fn();

jest.mock("../lib/authContext", () => ({
  useAuth: () => ({
    signInAnonymously: mockSignInAnonymously,
    isAuthed: false,
  }),
}));

jest.mock("react-router-dom", () => {
  const actual = jest.requireActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

// Capture the Turnstile callbacks so the test can simulate Cloudflare
// resolving with a token without loading the real script.
const mockTurnstileExecute = jest.fn();
const mockTurnstileReset = jest.fn();
const mockTurnstileCallbacks = { onSuccess: null, onError: null, onExpire: null };

jest.mock("@marsidev/react-turnstile", () => {
  const ReactInner = require("react");
  return {
    __esModule: true,
    Turnstile: ReactInner.forwardRef((props, ref) => {
      mockTurnstileCallbacks.onSuccess = props.onSuccess;
      mockTurnstileCallbacks.onError = props.onError;
      mockTurnstileCallbacks.onExpire = props.onExpire;
      ReactInner.useImperativeHandle(ref, () => ({
        execute: mockTurnstileExecute,
        reset: mockTurnstileReset,
      }));
      return null;
    }),
  };
});

const ORIGINAL_KEY = process.env.REACT_APP_TURNSTILE_SITE_KEY;

beforeEach(() => {
  mockSignInAnonymously.mockReset();
  mockNavigate.mockReset();
  mockTurnstileExecute.mockReset();
  mockTurnstileReset.mockReset();
  mockTurnstileCallbacks.onSuccess = null;
  mockTurnstileCallbacks.onError = null;
  mockTurnstileCallbacks.onExpire = null;
  process.env.REACT_APP_TURNSTILE_SITE_KEY = "test-site-key";
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.REACT_APP_TURNSTILE_SITE_KEY;
  } else {
    process.env.REACT_APP_TURNSTILE_SITE_KEY = ORIGINAL_KEY;
  }
});

// eslint-disable-next-line global-require
const StartFreeButton = require("./StartFreeButton").default;

function renderButton(props = {}) {
  return render(
    <MemoryRouter>
      <StartFreeButton testId="cta" {...props} />
    </MemoryRouter>,
  );
}

test("click resolves captcha, signs in anonymously, navigates to onboarding", async () => {
  mockSignInAnonymously.mockResolvedValue({ ok: true, existing: false });
  renderButton();

  const btn = screen.getByTestId("cta");
  act(() => {
    btn.click();
  });

  // Widget should be asked to execute now that no token is cached.
  await waitFor(() => expect(mockTurnstileExecute).toHaveBeenCalled());

  // Cloudflare resolves with a token.
  act(() => {
    mockTurnstileCallbacks.onSuccess("captcha-token-abc");
  });

  await waitFor(() => expect(mockSignInAnonymously).toHaveBeenCalledTimes(1));
  expect(mockSignInAnonymously).toHaveBeenCalledWith({
    captchaToken: "captcha-token-abc",
  });
  await waitFor(() =>
    expect(mockNavigate).toHaveBeenCalledWith("/app/onboarding/chat?mode=discovery"),
  );
});

test("on auth failure surfaces error and resets Turnstile", async () => {
  mockSignInAnonymously.mockRejectedValue(new Error("nope"));
  renderButton();

  const btn = screen.getByTestId("cta");
  act(() => {
    btn.click();
  });
  await waitFor(() => expect(mockTurnstileExecute).toHaveBeenCalled());
  act(() => {
    mockTurnstileCallbacks.onSuccess("captcha-token-zzz");
  });

  await waitFor(() => expect(mockSignInAnonymously).toHaveBeenCalled());
  await screen.findByRole("alert");
  expect(mockTurnstileReset).toHaveBeenCalled();
  expect(mockNavigate).not.toHaveBeenCalled();
});

test("does not navigate before sign-in resolves", async () => {
  let resolveSignIn;
  mockSignInAnonymously.mockImplementation(
    () => new Promise((res) => { resolveSignIn = res; }),
  );
  renderButton();

  const btn = screen.getByTestId("cta");
  act(() => {
    btn.click();
  });
  await waitFor(() => expect(mockTurnstileExecute).toHaveBeenCalled());
  act(() => {
    mockTurnstileCallbacks.onSuccess("captcha-token-pending");
  });
  await waitFor(() => expect(mockSignInAnonymously).toHaveBeenCalled());

  expect(mockNavigate).not.toHaveBeenCalled();

  act(() => {
    resolveSignIn({ ok: true });
  });

  await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
});

test("captcha disabled when site key is unset", async () => {
  delete process.env.REACT_APP_TURNSTILE_SITE_KEY;
  mockSignInAnonymously.mockResolvedValue({ ok: true });
  renderButton();

  const btn = screen.getByTestId("cta");
  act(() => {
    btn.click();
  });

  await waitFor(() => expect(mockSignInAnonymously).toHaveBeenCalled());
  expect(mockSignInAnonymously).toHaveBeenCalledWith({ captchaToken: undefined });
  expect(mockTurnstileExecute).not.toHaveBeenCalled();
});
