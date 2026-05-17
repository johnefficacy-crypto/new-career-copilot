jest.mock("../shared/config/env", () => ({
  BACKEND_URL: "http://localhost:8000",
  API_TIMEOUT_MS: 5000,
}));

jest.mock("./supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

import { apiFetch } from "./api";

describe("apiFetch error shape", () => {
  test("throws Error instance with enriched fields", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 409,
      headers: { get: () => "application/json" },
      json: async () => ({ detail: { code: "X", blocking_issues: ["a"] } }),
      text: async () => "",
    }));
    await expect(apiFetch("/api/test")).rejects.toBeInstanceOf(Error);
    try {
      await apiFetch("/api/test");
    } catch (err) {
      expect(err.status).toBe(409);
      expect(err.code).toBe("X");
      expect(err.blocking_issues).toEqual(["a"]);
    }
  });
});
