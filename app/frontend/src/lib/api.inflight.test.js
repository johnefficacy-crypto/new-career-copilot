/**
 * In-flight GET dedupe: two concurrent calls to the same path return
 * the same promise and only fire one fetch. StrictMode's double-mount
 * in dev was duplicating every Today GET; this caps that fan-out.
 */

jest.mock("./supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

jest.mock("../shared/config/env", () => ({
  __esModule: true,
  API_TIMEOUT_MS: 15000,
  BACKEND_URL: "http://backend.test",
}));

const fetchMock = jest.fn();
const realFetch = global.fetch;

beforeAll(() => {
  global.fetch = fetchMock;
});

afterAll(() => {
  global.fetch = realFetch;
});

beforeEach(() => {
  fetchMock.mockReset();
});

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

test("two concurrent GETs to the same path share a single fetch", async () => {
  // Hold the fetch promise so both callers race the same in-flight entry.
  let resolveFetch;
  fetchMock.mockReturnValueOnce(new Promise((resolve) => { resolveFetch = resolve; }));

  const { api } = await import("./api");
  const a = api.get("/api/x");
  const b = api.get("/api/x");
  resolveFetch(jsonResponse({ ok: true }));
  const [ra, rb] = await Promise.all([a, b]);
  expect(ra).toEqual({ ok: true });
  expect(rb).toEqual({ ok: true });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("second GET after the first resolves does refetch", async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse({ n: 1 }));
  fetchMock.mockResolvedValueOnce(jsonResponse({ n: 2 }));
  const { api } = await import("./api");
  const first = await api.get("/api/y");
  const second = await api.get("/api/y");
  expect(first).toEqual({ n: 1 });
  expect(second).toEqual({ n: 2 });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
