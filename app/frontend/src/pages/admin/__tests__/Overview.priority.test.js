import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

jest.mock("../../../lib/api", () => ({
  __esModule: true,
  api: { get: jest.fn() },
}));

import { api } from "../../../lib/api";
import Overview from "../Overview";

afterEach(() => {
  api.get.mockReset();
});

test("Priority work section renders above KPIs and lists work that has counts > 0", async () => {
  api.get.mockResolvedValue({
    kpis: {
      moderation_p0_open: 3,
      copyright_open: 2,
      open_flags: 5,
      queue_depth: 10,
    },
    recent_audit: [],
  });

  render(
    <MemoryRouter>
      <Overview />
    </MemoryRouter>,
  );

  const priority = await screen.findByTestId("overview-priority-work");
  expect(priority).toBeTruthy();

  // Priority work block must come before the KPI heading "Trust desk".
  const trustDesk = screen.getByText("Trust desk");
  expect(priority.compareDocumentPosition(trustDesk) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

  expect(screen.getByTestId("priority-work-moderation_p0_open")).toBeTruthy();
  expect(screen.getByTestId("priority-work-copyright_open")).toBeTruthy();
  expect(screen.getByTestId("priority-work-open_flags")).toBeTruthy();
});

test("Priority work shows calm empty state when nothing is actionable", async () => {
  api.get.mockResolvedValue({
    kpis: { moderation_p0_open: 0, copyright_open: 0, open_flags: 0 },
    recent_audit: [],
  });

  render(
    <MemoryRouter>
      <Overview />
    </MemoryRouter>,
  );

  await waitFor(() => expect(screen.getByTestId("priority-work-empty")).toBeTruthy());
  expect(screen.queryByTestId("priority-work-moderation_p0_open")).toBeNull();
});
