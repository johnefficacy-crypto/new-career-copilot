import {
  isSafeInternalPath,
  resolvePostAuthRedirect,
} from "./resolvePostAuthRedirect";

function makeParams(query) {
  return new URLSearchParams(query);
}

describe("isSafeInternalPath", () => {
  test("accepts internal paths starting with single slash", () => {
    expect(isSafeInternalPath("/app/today")).toBe(true);
    expect(isSafeInternalPath("/app/today?x=1")).toBe(true);
    expect(isSafeInternalPath("/login")).toBe(true);
  });

  test("rejects protocol-relative and absolute URLs (open-redirect guard)", () => {
    expect(isSafeInternalPath("//evil.com")).toBe(false);
    expect(isSafeInternalPath("https://evil.com")).toBe(false);
    expect(isSafeInternalPath("http://evil.com/app/today")).toBe(false);
    expect(isSafeInternalPath("javascript:alert(1)")).toBe(false);
  });

  test("rejects empty, non-string, or relative values", () => {
    expect(isSafeInternalPath("")).toBe(false);
    expect(isSafeInternalPath(null)).toBe(false);
    expect(isSafeInternalPath(undefined)).toBe(false);
    expect(isSafeInternalPath(123)).toBe(false);
    expect(isSafeInternalPath("app/today")).toBe(false);
  });
});

describe("resolvePostAuthRedirect priority order", () => {
  const DEFAULT = "/app";

  test("returns state.from.pathname first when present and safe", () => {
    const location = { state: { from: { pathname: "/app/exams", search: "?q=1" } } };
    const params = makeParams("next=/app/today");
    expect(resolvePostAuthRedirect(location, params, DEFAULT)).toBe("/app/exams?q=1");
  });

  test("falls back to ?next= when state.from missing", () => {
    const location = {};
    const params = makeParams("next=/app/today?x=1");
    expect(resolvePostAuthRedirect(location, params, DEFAULT)).toBe("/app/today?x=1");
  });

  test("falls back to default when nothing supplied", () => {
    expect(resolvePostAuthRedirect({}, makeParams(""), DEFAULT)).toBe(DEFAULT);
  });

  test("ignores unsafe ?next= values and falls through to default", () => {
    const location = {};
    expect(
      resolvePostAuthRedirect(location, makeParams("next=//evil.com"), DEFAULT),
    ).toBe(DEFAULT);
    expect(
      resolvePostAuthRedirect(location, makeParams("next=https://evil.com"), DEFAULT),
    ).toBe(DEFAULT);
    expect(
      resolvePostAuthRedirect(location, makeParams("next=app/today"), DEFAULT),
    ).toBe(DEFAULT);
  });

  test("ignores unsafe state.from values and falls through to next=", () => {
    const location = { state: { from: { pathname: "//evil.com" } } };
    const params = makeParams("next=/app/today");
    expect(resolvePostAuthRedirect(location, params, DEFAULT)).toBe("/app/today");
  });

  test("accepts a raw query string for searchParams as well", () => {
    const location = {};
    expect(resolvePostAuthRedirect(location, "next=/app/today", DEFAULT)).toBe(
      "/app/today",
    );
  });
});

describe("isSafeInternalPath open-redirect guards", () => {
  test("rejects backslash escape", () => {
    expect(isSafeInternalPath("/\\evil.com")).toBe(false);
  });
  test("rejects percent-encoded protocol-relative tricks", () => {
    expect(isSafeInternalPath("/%2Fevil.com")).toBe(false);
    expect(isSafeInternalPath("/%2fevil.com")).toBe(false);
    expect(isSafeInternalPath("/%5Cevil.com")).toBe(false);
    expect(isSafeInternalPath("/%5cevil.com")).toBe(false);
  });
});

describe("resolvePostAuthRedirect object signature", () => {
  test("accepts safe next", () => {
    expect(resolvePostAuthRedirect({ next: "/app/study/plan" })).toBe(
      "/app/study/plan",
    );
  });
  test("falls back to from when next is unsafe", () => {
    expect(
      resolvePostAuthRedirect({ next: "//evil.com", from: "/app/profile" }),
    ).toBe("/app/profile");
  });
  test("uses default fallback when both unsafe", () => {
    expect(
      resolvePostAuthRedirect({ next: "https://evil.com", from: null }),
    ).toBe("/app");
  });
  test("uses caller-provided fallback", () => {
    expect(
      resolvePostAuthRedirect({ next: undefined, fallback: "/x" }),
    ).toBe("/x");
  });
  test("rejects every shape of open-redirect input", () => {
    for (const bad of [
      "//evil.com",
      "/\\evil.com",
      "/%2Fevil.com",
      "/%5Cevil.com",
      "https://evil.com",
      "",
      null,
      undefined,
      42,
    ]) {
      expect(resolvePostAuthRedirect({ next: bad })).toBe("/app");
    }
  });
});
