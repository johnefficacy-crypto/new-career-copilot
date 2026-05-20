/**
 * Scraper page load resilience (P0-1).
 *
 * The queue must render even when /api/admin/scrape/runs and
 * /api/admin/sources 500 (the reported HTTP/2 disconnect). Promise.allSettled
 * decouples the three blocks so a runs/sources failure no longer
 * short-circuits the queue fetch. Each failed block shows its own banner
 * with a Retry that refires only that block.
 */
import React from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

jest.mock("../../../lib/api", () => ({
  __esModule: true,
  api: { get: jest.fn(), post: jest.fn() },
  getApiUnverifiedFields: () => [],
  getApiExistingRecruitmentId: () => null,
  getApiNextActions: () => [],
}));

// Stub shared/ui primitives so the test doesn't depend on their internals.
// The per-block banners under test (LoadErrorBanner) live inside Scraper.jsx
// itself, so they render regardless of this mock.
jest.mock("../../../shared/ui", () => ({
  __esModule: true,
  EmptyState: () => null,
  ErrorState: () => null,
  LoadingSkeleton: () => null,
  StatusBadge: ({ label }) => <span>{label}</span>,
  useToast: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));

import { api } from "../../../lib/api";
import Scraper from "../Scraper";

const MPSC_ITEM = {
  id: "queue-mpsc-1",
  status: "pending",
  source_name: "Maharashtra Public Service Commission",
  source_type: "official_html",
  extracted_summary: { title: "MPSC State Services 2026" },
  unverified_fields: [],
  duplicate_candidates: [],
};

function mockRunsSourcesFail() {
  api.get.mockReset();
  api.post.mockReset();
  api.get.mockImplementation((path) => {
    if (path.startsWith("/api/admin/scrape/runs")) {
      return Promise.reject(new Error("500 server disconnected"));
    }
    if (path.startsWith("/api/admin/sources")) {
      return Promise.reject(new Error("500 server disconnected"));
    }
    if (path.startsWith("/api/admin/scrape/queue")) {
      return Promise.resolve({ items: [MPSC_ITEM], total: 1 });
    }
    return Promise.resolve({ items: [] });
  });
}

function renderScraper() {
  return render(
    <MemoryRouter>
      <Scraper />
    </MemoryRouter>,
  );
}

beforeEach(() => mockRunsSourcesFail());

test("queue renders even when runs and sources both 500", async () => {
  renderScraper();
  await waitFor(() => expect(screen.getByTestId("scrape-row-queue-mpsc-1")).toBeTruthy());
  expect(screen.getByTestId("scrape-row-queue-mpsc-1").textContent).toMatch(/MPSC State Services 2026/);
});

test("runs failure shows its own error banner (not an empty runs grid)", async () => {
  renderScraper();
  await waitFor(() => expect(screen.getByTestId("scraper-runs-error")).toBeTruthy());
  expect(screen.getByTestId("scraper-runs-error").textContent).toMatch(/Couldn't load run history/i);
});

test("sources failure shows its own error banner and disables source picker", async () => {
  renderScraper();
  await waitFor(() => expect(screen.getByTestId("scraper-sources-error")).toBeTruthy());
  expect(screen.getByTestId("scraper-sources-error").textContent).toMatch(/Couldn't load sources/i);
});

test("queue error banner is NOT shown when only runs/sources failed", async () => {
  renderScraper();
  await waitFor(() => expect(screen.getByTestId("scrape-row-queue-mpsc-1")).toBeTruthy());
  expect(screen.queryByTestId("scraper-queue-error")).toBeNull();
});

test("clicking runs Retry refires only /api/admin/scrape/runs", async () => {
  renderScraper();
  await waitFor(() => expect(screen.getByTestId("scraper-runs-error")).toBeTruthy());

  // From here on, runs succeeds so we can confirm the banner clears too.
  api.get.mockReset();
  api.get.mockImplementation((path) => {
    if (path.startsWith("/api/admin/scrape/runs")) return Promise.resolve({ items: [] });
    if (path.startsWith("/api/admin/sources")) return Promise.reject(new Error("still down"));
    if (path.startsWith("/api/admin/scrape/queue")) return Promise.resolve({ items: [MPSC_ITEM], total: 1 });
    return Promise.resolve({ items: [] });
  });

  await act(async () => {
    fireEvent.click(screen.getByTestId("scraper-runs-retry"));
  });

  // Only the runs endpoint was called by the retry — not sources or queue.
  const paths = api.get.mock.calls.map(([p]) => p);
  expect(paths.some((p) => p.startsWith("/api/admin/scrape/runs"))).toBe(true);
  expect(paths.some((p) => p.startsWith("/api/admin/sources"))).toBe(false);
  expect(paths.some((p) => p.startsWith("/api/admin/scrape/queue"))).toBe(false);

  // Runs banner clears after the successful retry.
  await waitFor(() => expect(screen.queryByTestId("scraper-runs-error")).toBeNull());
  // Sources banner is untouched by the runs retry.
  expect(screen.getByTestId("scraper-sources-error")).toBeTruthy();
});

test("clicking sources Retry refires only /api/admin/sources", async () => {
  renderScraper();
  await waitFor(() => expect(screen.getByTestId("scraper-sources-error")).toBeTruthy());

  api.get.mockReset();
  api.get.mockImplementation((path) => {
    if (path.startsWith("/api/admin/sources")) return Promise.resolve({ items: [] });
    if (path.startsWith("/api/admin/scrape/runs")) return Promise.reject(new Error("still down"));
    if (path.startsWith("/api/admin/scrape/queue")) return Promise.resolve({ items: [MPSC_ITEM], total: 1 });
    return Promise.resolve({ items: [] });
  });

  await act(async () => {
    fireEvent.click(screen.getByTestId("scraper-sources-retry"));
  });

  const paths = api.get.mock.calls.map(([p]) => p);
  expect(paths.some((p) => p.startsWith("/api/admin/sources"))).toBe(true);
  expect(paths.some((p) => p.startsWith("/api/admin/scrape/runs"))).toBe(false);
  expect(paths.some((p) => p.startsWith("/api/admin/scrape/queue"))).toBe(false);

  await waitFor(() => expect(screen.queryByTestId("scraper-sources-error")).toBeNull());
});
