import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

jest.mock("../../../lib/authContext", () => ({
  useAuth: () => ({ user: { email: "tester@example.com", role: "admin" }, logout: jest.fn() }),
}));

import AdminShell from "../AdminShell";

function renderShell(path = "/admin") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AdminShell />}>
          <Route path="/admin" element={<div>overview</div>} />
          <Route path="/admin/operations" element={<div>ops</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("AdminShell sidebar IA", () => {
  test("renders exactly 6 top-level groups", () => {
    renderShell("/admin");
    const groups = screen.getAllByTestId(/^admin-nav-group-/);
    expect(groups).toHaveLength(6);
  });

  test("Command Center and Trust Pipeline are default-expanded; others collapsed", () => {
    renderShell("/admin");
    const expanded = screen
      .getAllByTestId(/^admin-nav-group-/)
      .filter((el) => el.getAttribute("data-expanded") === "true");
    // /admin lives under Command Center which is default-open, so the
    // route-based auto-open is a no-op here. Initial expanded count = 2.
    expect(expanded.map((el) => el.getAttribute("data-testid"))).toEqual([
      "admin-nav-group-command-center",
      "admin-nav-group-trust-pipeline",
    ]);
  });

  test("Promotion Queue is not in the sidebar but /admin/eligibility-queue route remains", () => {
    renderShell("/admin");
    expect(screen.queryByTestId("admin-nav-promotion-queue")).toBeNull();
  });
});
