/**
 * Scraper page network behaviour.
 *
 * Pins the duplicate-fetch fix: initial mount issues exactly one call to
 * /api/admin/scrape/queue (the debounced filter-effect's first run no
 * longer double-fetches), filter changes issue one debounced call, the
 * Reload button issues one queue call, and opening the detail drawer
 * issues one separate ?include_detail=true request rather than another
 * list fetch.
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

// ── Mocks ────────────────────────────────────────────────────────────
// Stub the API layer so we can count calls per endpoint.
const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock("../../lib/api", () => ({
  api: {
    get: (...args) => mockGet(...args),
    post: (...args) => mockPost(...args),
  },
  getApiExistingRecruitmentId: jest.fn(() => null),
  getApiNextActions: jest.fn(() => []),
  getApiUnverifiedFields: jest.fn(() => []),
}));

// Replace heavy child components with no-ops so the test doesn't need
// the full admin module graph (the contract under test is purely the
// list/detail call pattern on the page itself).
jest.mock(
  "../../features/admin/workflow/AdminWorkflowStepper",
  () => () => null,
);
jest.mock(
  "../../features/admin/workflow/NextActionCallout",
  () => () => null,
);
jest.mock(
  "../../features/admin/workflow/FieldReviewGroup",
  () => () => null,
);
jest.mock(
  "../../features/admin/workflow/PromotionPreviewPanel",
  () => () => null,
);
jest.mock(
  "../../features/admin/scraping/ScrapeRunDetailDrawer",
  () => () => null,
);
jest.mock(
  "../../features/admin/shared/InlineAuditTimeline",
  () => () => null,
);
jest.mock("../../features/admin/workflow/adminWorkflowContract", () => ({
  HIGH_RISK_QUEUE_FIELDS: [],
  NEXT_ACTION_MESSAGES: { reviewQueue: "", runDryFirst: "" },
  RECOMMENDED_REVIEW_FIELDS: [],
  SOURCE_TYPE_LABELS: {},
}));
jest.mock("../../shared/a11y/useFocusTrap", () => ({
  useFocusTrap: () => null,
}));
jest.mock("../../shared/ui", () => ({
  EmptyState: () => null,
  ErrorState: () => null,
  LoadingSkeleton: () => null,
  StatusBadge: () => null,
  useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));
jest.mock("../../features/admin/workflow/scoreUtils", () => ({
  formatScorePct: (n) => `${n}`,
}));

const Scraper = require("./Scraper").default;

function setupApi() {
  mockGet.mockImplementation((url) => {
    if (url.startsWith("/api/admin/scrape/queue")) {
      // Lightweight list shape.
      return Promise.resolve({
        items: [
          {
            id: "q-1",
            status: "pending",
            source_name: "Source A",
            source_url: "https://x.gov.in/a",
            extracted_summary: { title: "Recruitment A", organization_name: "Org A" },
            has_duplicate_candidates: false,
            duplicate_candidates: [],
            unverified_fields: [],
            promotable: true,
            data_quality_score: 80,
            confidence_score: 0.9,
            field_evidence_status: {},
            field_evidence_details: [],
            open_conflicts: 0,
            source_type: "official",
          },
        ],
        total: 1,
      });
    }
    if (url === "/api/admin/scrape/runs") return Promise.resolve({ items: [] });
    if (url === "/api/admin/sources") return Promise.resolve({ items: [] });
    return Promise.resolve({ items: [] });
  });
  mockPost.mockResolvedValue({ ok: true });
}

function queueCalls() {
  return mockGet.mock.calls.filter(([url]) =>
    typeof url === "string" && url.startsWith("/api/admin/scrape/queue"),
  );
}

function listCalls() {
  return queueCalls().filter(([url]) => !url.includes("include_detail=true"));
}

function detailCalls() {
  return queueCalls().filter(([url]) => url.includes("include_detail=true"));
}

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  setupApi();
});

test("initial mount issues exactly one queue list call", async () => {
  render(<Scraper />);
  await waitFor(() => expect(listCalls().length).toBeGreaterThanOrEqual(1));
  // Give the debounced effect time to fire if it were going to.
  await act(() => new Promise((r) => setTimeout(r, 400)));
  expect(listCalls().length).toBe(1);
  expect(detailCalls().length).toBe(0);
});

test("filter change issues exactly one debounced call", async () => {
  render(<Scraper />);
  await waitFor(() => expect(listCalls().length).toBe(1));

  // Click the "Approved/Promoted" filter pill.
  fireEvent.click(screen.getByText(/Promoted/i));
  // Debounce window is 250ms; wait past it.
  await act(() => new Promise((r) => setTimeout(r, 400)));

  expect(listCalls().length).toBe(2); // initial + filter-triggered
});

test("Reload button issues exactly one queue list call", async () => {
  render(<Scraper />);
  await waitFor(() => expect(listCalls().length).toBe(1));

  const reload = screen.getByRole("button", { name: /Reload/i });
  fireEvent.click(reload);
  await act(() => new Promise((r) => setTimeout(r, 400)));

  // Reload re-runs load(): runs + sources + 1 queue call.
  expect(listCalls().length).toBe(2);
  // Reload must also re-fetch runs and sources, exactly once each.
  const runCalls = mockGet.mock.calls.filter(([url]) => url === "/api/admin/scrape/runs");
  const sourceCalls = mockGet.mock.calls.filter(([url]) => url === "/api/admin/sources");
  expect(runCalls.length).toBe(2); // mount + reload
  expect(sourceCalls.length).toBe(2);
});

test("opening detail drawer issues one include_detail=true call, not another list call", async () => {
  render(<Scraper />);
  await waitFor(() => expect(listCalls().length).toBe(1));

  // Click the Inspect button on the only row. The button text/icon is
  // rendered by QueueRowAction; the data-testid on the row gives us a
  // stable hook to find its action button.
  const row = await screen.findByTestId("scrape-row-q-1");
  const inspect = row.querySelector("button");
  await act(async () => {
    fireEvent.click(inspect);
  });
  await waitFor(() => expect(detailCalls().length).toBe(1));

  // Drawer open did NOT trigger another list call.
  expect(listCalls().length).toBe(1);
  // Confirm the detail URL is row-scoped.
  expect(detailCalls()[0][0]).toMatch(/item_id=q-1/);
  expect(detailCalls()[0][0]).toMatch(/include_detail=true/);
});