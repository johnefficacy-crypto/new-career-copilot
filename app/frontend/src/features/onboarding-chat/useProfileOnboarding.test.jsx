import { renderHook, act, waitFor } from "@testing-library/react";

const mockGet = jest.fn();
const mockSignInAnonymously = jest.fn();
const mockEnv = { CAPTCHA_REQUIRED_FOR_ANON: false };

jest.mock("../../lib/api", () => ({
  __esModule: true,
  api: {
    get: (...args) => mockGet(...args),
    post: jest.fn(),
  },
}));

// useAuth() returns a fresh object each call, but the function refs
// inside are stable (point at the same jest.fn instances) — that mirrors
// the real authContext, which keeps signInAnonymously stable via
// useCallback. Without stable refs the hook would infinite-loop on its
// own deps array.
jest.mock("../../lib/authContext", () => ({
  useAuth: () => ({
    user: null,
    status: "guest",
    signInAnonymously: mockSignInAnonymously,
  }),
}));

jest.mock("../../shared/config/env", () => ({
  __esModule: true,
  get CAPTCHA_REQUIRED_FOR_ANON() {
    return mockEnv.CAPTCHA_REQUIRED_FOR_ANON;
  },
}));

beforeEach(() => {
  mockGet.mockReset();
  mockSignInAnonymously.mockReset();
  mockEnv.CAPTCHA_REQUIRED_FOR_ANON = false;
  mockGet.mockResolvedValue({
    profile: { id: "u1" },
    next_question: { key: "q1" },
    onboarding_completed: false,
  });
  mockSignInAnonymously.mockResolvedValue({ ok: true });
});

test("reload re-runs bootstrap (sign-in + fetch), not fetch-only", async () => {
  // eslint-disable-next-line global-require
  const { useProfileOnboarding } = require("./useProfileOnboarding");
  const { result } = renderHook(() => useProfileOnboarding());

  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(mockSignInAnonymously).toHaveBeenCalledTimes(1);
  expect(mockGet).toHaveBeenCalledTimes(1);

  await act(async () => {
    await result.current.reload();
  });

  // reload === bootstrap, so the anon sign-in path runs again (it's a no-op
  // server-side when a session already exists) AND the fetch runs again.
  expect(mockSignInAnonymously).toHaveBeenCalledTimes(2);
  expect(mockGet).toHaveBeenCalledTimes(2);
});

test("guest + CAPTCHA on → needs_auth_start, no auto sign-in, no fetch", async () => {
  mockEnv.CAPTCHA_REQUIRED_FOR_ANON = true;
  // eslint-disable-next-line global-require
  const { useProfileOnboarding } = require("./useProfileOnboarding");
  const { result } = renderHook(() => useProfileOnboarding());

  await waitFor(() => expect(result.current.status).toBe("needs_auth_start"));
  expect(mockSignInAnonymously).not.toHaveBeenCalled();
  expect(mockGet).not.toHaveBeenCalled();
  expect(result.current.error).toBeNull();
});

test("guest + no key → dev path: signInAnonymously + fetchNext", async () => {
  mockEnv.CAPTCHA_REQUIRED_FOR_ANON = false;
  // eslint-disable-next-line global-require
  const { useProfileOnboarding } = require("./useProfileOnboarding");
  const { result } = renderHook(() => useProfileOnboarding());

  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(mockSignInAnonymously).toHaveBeenCalledTimes(1);
  expect(mockGet).toHaveBeenCalledTimes(1);
});
