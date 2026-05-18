import React from "react";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

jest.mock("../../../lib/api", () => ({
  __esModule: true,
  api: { get: jest.fn() },
}));

import { api } from "../../../lib/api";
import AdminAudit from "../Audit";

afterEach(() => {
  api.get.mockReset();
});

test("AdminAudit page passes entity_type so backend does not 422", async () => {
  // Backend GET /admin/audit requires entity_type (admin_eligibility.py).
  // A bare call returned 422; the page must scope by entity_type.
  api.get.mockResolvedValue({ items: [] });

  render(
    <MemoryRouter>
      <AdminAudit />
    </MemoryRouter>,
  );

  await waitFor(() => expect(api.get).toHaveBeenCalled());
  const calls = api.get.mock.calls.map(([url]) => url);
  expect(calls.some((u) => u.startsWith("/api/admin/audit"))).toBe(true);
  for (const url of calls) {
    if (url.startsWith("/api/admin/audit")) {
      expect(url).toMatch(/[?&]entity_type=/);
    }
  }
});
