import React from "react";
import { render, act, waitFor } from "@testing-library/react";

const mockGetSession = jest.fn();
const mockSignInAnonymously = jest.fn();
const mockAuthMe = jest.fn();

jest.mock("./supabase", () => ({
  __esModule: true,
  supabase: {
    auth: {
      getSession: (...args) => mockGetSession(...args),
      signInAnonymously: (...args) => mockSignInAnonymously(...args),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: jest.fn() } } }),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
      signInWithOAuth: jest.fn(),
      linkIdentity: jest.fn(),
      updateUser: jest.fn(),
      resetPasswordForEmail: jest.fn(),
    },
  },
}));

jest.mock("./api", () => ({
  __esModule: true,
  auth: { me: (...args) => mockAuthMe(...args) },
}));

beforeEach(() => {
  mockGetSession.mockReset();
  mockSignInAnonymously.mockReset();
  mockAuthMe.mockReset();
  mockGetSession.mockResolvedValue({ data: { session: null } });
});

function Capture({ onReady }) {
  // eslint-disable-next-line global-require
  const { useAuth } = require("./authContext");
  const auth = useAuth();
  React.useEffect(() => {
    onReady(auth);
  }, [auth, onReady]);
  return null;
}

function mount() {
  // eslint-disable-next-line global-require
  const { AuthProvider } = require("./authContext");
  let captured;
  const onReady = (val) => {
    captured = val;
  };
  render(
    <AuthProvider>
      <Capture onReady={onReady} />
    </AuthProvider>,
  );
  return () => captured;
}

test("signInAnonymously surfaces Supabase error message, code, and status", async () => {
  mockSignInAnonymously.mockResolvedValue({
    data: { session: null },
    error: {
      message: "captcha protection: request disallowed (captcha_failed)",
      code: "captcha_failed",
      status: 400,
    },
  });

  const get = mount();
  await waitFor(() => expect(typeof get()?.signInAnonymously).toBe("function"));

  let thrown;
  await act(async () => {
    try {
      await get().signInAnonymously({ captchaToken: "tok" });
    } catch (e) {
      thrown = e;
    }
  });

  expect(thrown).toBeInstanceOf(Error);
  expect(thrown.message).toMatch(/captcha protection/);
  expect(thrown.message).toMatch(/code=captcha_failed/);
  expect(thrown.message).toMatch(/status=400/);
});

test("signInAnonymously passes the captcha token through to Supabase", async () => {
  mockSignInAnonymously.mockResolvedValue({
    data: {
      session: {
        access_token: "jwt-xyz",
        user: { id: "anon-1", is_anonymous: true, user_metadata: {}, app_metadata: {} },
      },
      user: { id: "anon-1", is_anonymous: true, user_metadata: {}, app_metadata: {} },
    },
    error: null,
  });
  mockAuthMe.mockRejectedValue(new Error("backend offline"));

  const get = mount();
  await waitFor(() => expect(typeof get()?.signInAnonymously).toBe("function"));

  await act(async () => {
    await get().signInAnonymously({ captchaToken: "abc-token" });
  });

  expect(mockSignInAnonymously).toHaveBeenCalledWith({
    options: { captchaToken: "abc-token" },
  });
});
