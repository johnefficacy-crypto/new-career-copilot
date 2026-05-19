import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";

const mockUseProfileCompletion = jest.fn();

jest.mock("../../features/profile/hooks/useProfileCompletion", () => ({
  __esModule: true,
  default: (...args) => mockUseProfileCompletion(...args),
}));

import UserMenu from "./UserMenu";

function renderMenu() {
  return render(
    <MemoryRouter>
      <UserMenu
        user={{ name: "Test Aspirant", email: "t@example.com", role: "aspirant" }}
        onLogout={() => {}}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => mockUseProfileCompletion.mockReset());

test("renders green dot when completion ≥ 80%", () => {
  mockUseProfileCompletion.mockReturnValue({ pct: 85, status: "green", loading: false, error: null });
  renderMenu();
  const dot = screen.getByTestId("user-menu-status-dot");
  expect(dot.getAttribute("data-status")).toBe("green");
  expect(dot.getAttribute("aria-label")).toMatch(/85%/);
});

test("renders amber dot when 50% ≤ completion < 80%", () => {
  mockUseProfileCompletion.mockReturnValue({ pct: 60, status: "amber", loading: false, error: null });
  renderMenu();
  const dot = screen.getByTestId("user-menu-status-dot");
  expect(dot.getAttribute("data-status")).toBe("amber");
});

test("renders red dot when completion < 50%", () => {
  mockUseProfileCompletion.mockReturnValue({ pct: 25, status: "red", loading: false, error: null });
  renderMenu();
  const dot = screen.getByTestId("user-menu-status-dot");
  expect(dot.getAttribute("data-status")).toBe("red");
});

test("suppresses the dot while loading", () => {
  mockUseProfileCompletion.mockReturnValue({ pct: 0, status: "red", loading: true, error: null });
  renderMenu();
  expect(screen.queryByTestId("user-menu-status-dot")).toBeNull();
});

test("suppresses the dot when the completion call fails", () => {
  mockUseProfileCompletion.mockReturnValue({
    pct: 0,
    status: "red",
    loading: false,
    error: new Error("net"),
  });
  renderMenu();
  expect(screen.queryByTestId("user-menu-status-dot")).toBeNull();
});
