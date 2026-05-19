import React from "react";
import { render, act, waitFor } from "@testing-library/react";

const mockGetSession = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockSignUp = jest.fn();
const mockSignInWithOAuth = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockAuthMe = jest.fn();
let authStateCallback = null;

jest.mock("./supabase", () => ({
  __esModule: true,
  supabase: {
    auth: {
      getSession: (...args) => mockGetSession(...args),
      signInWithPassword: (...args) => mockSignInWithPassword(...args),
      signUp: (...args) => mockSignUp(...args),
      signInWithOAuth: (...args) => mockSignInWithOAuth(...args),
      onAuthStateChange: (cb) => {
        authStateCallback = cb;
        return mockOnAuthStateChange();
      },
      signInAnonymously: jest.fn(),
      signOut: jest.fn(),
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
  mockSignInWithPassword.mockReset();
  mockSignUp.mockReset();
  mockSignInWithOAuth.mockReset();
  mockOnAuthStateChange.mockReset();
  mockAuthMe.mockReset();
  authStateCallback = null;
  mockGetSession.mockResolvedValue({ data: { session: null } });
  mockOnAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: jest.fn() } },
  });
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
  render(
    <AuthProvider>
      <Capture
        onReady={(val) => {
          captured = val;
        }}
      />
    </AuthProvider>,
  );
  return () => captured;
}

test("login passes captchaToken under options.captchaToken", async () => {
  mockSignInWithPassword.mockResolvedValue({
    data: { session: null, user: { id: "u1", user_metadata: {}, app_metadata: {} } },
    error: null,
  });
  const get = mount();
  await waitFor(() => expect(typeof get()?.login).toBe("function"));
  await act(async () => {
    await get().login("e@x.com", "pw", { captchaToken: "T1" });
  });
  expect(mockSignInWithPassword).toHaveBeenCalledWith({
    email: "e@x.com",
    password: "pw",
    options: { captchaToken: "T1" },
  });
});

test("login passes options=undefined when no captchaToken", async () => {
  mockSignInWithPassword.mockResolvedValue({
    data: { session: null, user: { id: "u1", user_metadata: {}, app_metadata: {} } },
    error: null,
  });
  const get = mount();
  await waitFor(() => expect(typeof get()?.login).toBe("function"));
  await act(async () => {
    await get().login("e@x.com", "pw");
  });
  expect(mockSignInWithPassword).toHaveBeenCalledWith({
    email: "e@x.com",
    password: "pw",
    options: undefined,
  });
});

test("register passes captchaToken alongside data.name in options", async () => {
  mockSignUp.mockResolvedValue({
    data: { session: null, user: { id: "u2", user_metadata: {}, app_metadata: {} } },
    error: null,
  });
  const get = mount();
  await waitFor(() => expect(typeof get()?.register).toBe("function"));
  await act(async () => {
    await get().register({
      email: "e@x.com",
      password: "pw",
      name: "Alice",
      captchaToken: "T2",
    });
  });
  expect(mockSignUp).toHaveBeenCalledWith({
    email: "e@x.com",
    password: "pw",
    options: { data: { name: "Alice" }, captchaToken: "T2" },
  });
});

test("hydrate dedupes consecutive sessions sharing the same access_token", async () => {
  mockAuthMe.mockResolvedValue({ user: { id: "u3", role: "user" } });
  const session = {
    access_token: "same-token",
    user: { id: "u3", user_metadata: {}, app_metadata: {} },
  };
  mockGetSession.mockResolvedValue({ data: { session } });

  mount();
  await waitFor(() => expect(mockAuthMe).toHaveBeenCalledTimes(1));

  // A duplicate onAuthStateChange firing with the same token must not refetch.
  await act(async () => {
    authStateCallback("INITIAL_SESSION", session);
    await new Promise((r) => setTimeout(r, 0));
  });
  expect(mockAuthMe).toHaveBeenCalledTimes(1);
});

test("SIGNED_OUT clears the dedupe ref so re-sign-in re-hydrates", async () => {
  mockAuthMe.mockResolvedValue({ user: { id: "u4", role: "user" } });
  const session = {
    access_token: "tokA",
    user: { id: "u4", user_metadata: {}, app_metadata: {} },
  };
  mockGetSession.mockResolvedValue({ data: { session } });

  mount();
  await waitFor(() => expect(mockAuthMe).toHaveBeenCalledTimes(1));

  await act(async () => {
    authStateCallback("SIGNED_OUT", null);
    await new Promise((r) => setTimeout(r, 0));
  });

  await act(async () => {
    authStateCallback("SIGNED_IN", session);
    await new Promise((r) => setTimeout(r, 0));
  });
  expect(mockAuthMe).toHaveBeenCalledTimes(2);
});

test("loginWithGoogle builds /auth/callback?next=... and accepts only path", async () => {
  mockSignInWithOAuth.mockResolvedValue({ data: {}, error: null });
  const get = mount();
  await waitFor(() => expect(typeof get()?.loginWithGoogle).toBe("function"));

  await act(async () => {
    await get().loginWithGoogle({ redirectTo: "/app/study/plan" });
  });
  const call = mockSignInWithOAuth.mock.calls[0][0];
  expect(call.provider).toBe("google");
  expect(call.options.redirectTo).toBe(
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      "/app/study/plan",
    )}`,
  );
});

test("loginWithGoogle rejects full URLs and falls back to /app", async () => {
  mockSignInWithOAuth.mockResolvedValue({ data: {}, error: null });
  const get = mount();
  await waitFor(() => expect(typeof get()?.loginWithGoogle).toBe("function"));

  await act(async () => {
    await get().loginWithGoogle({ redirectTo: "https://evil.com/hijack" });
  });
  const call = mockSignInWithOAuth.mock.calls[0][0];
  expect(call.options.redirectTo).toBe(
    `${window.location.origin}/auth/callback?next=${encodeURIComponent("/app")}`,
  );
});

test("loginWithGoogle rejects protocol-relative redirectTo", async () => {
  mockSignInWithOAuth.mockResolvedValue({ data: {}, error: null });
  const get = mount();
  await waitFor(() => expect(typeof get()?.loginWithGoogle).toBe("function"));

  await act(async () => {
    await get().loginWithGoogle({ redirectTo: "//evil.com" });
  });
  const call = mockSignInWithOAuth.mock.calls[0][0];
  expect(call.options.redirectTo).toBe(
    `${window.location.origin}/auth/callback?next=${encodeURIComponent("/app")}`,
  );
});
