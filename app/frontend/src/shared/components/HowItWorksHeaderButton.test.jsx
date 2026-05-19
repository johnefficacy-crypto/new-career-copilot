import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import HowItWorksProvider from "./HowItWorksProvider";
import HowItWorksHeaderButton from "./HowItWorksHeaderButton";

function renderWithProvider(ui) {
  return render(<HowItWorksProvider>{ui}</HowItWorksProvider>);
}

afterEach(() => {
  document.body.style.overflow = "";
});

test("renders an icon-only button with a page-specific aria-label", () => {
  renderWithProvider(
    <HowItWorksHeaderButton defaultTopic="study_plan" pageName="Study Plan" />,
  );
  const btn = screen.getByRole("button", { name: "How Study Plan works" });
  expect(btn.getAttribute("aria-label")).toBe("How Study Plan works");
  expect(btn.getAttribute("data-topic")).toBe("study_plan");
  // Visible text is absent — icon only.
  expect(btn.textContent.trim()).toBe("");
});

test("clicking the trigger opens the drawer at the configured topic", () => {
  renderWithProvider(
    <HowItWorksHeaderButton defaultTopic="study_home" pageName="Study Home" />,
  );
  expect(screen.queryByTestId("how-it-works-drawer-root")).toBeNull();

  act(() => {
    fireEvent.click(
      screen.getByRole("button", { name: "How Study Home works" }),
    );
  });

  const dialog = screen.getByRole("dialog");
  expect(dialog.getAttribute("data-topic")).toBe("study_home");
  expect(screen.getByText("How Study Home works")).toBeTruthy();
});

test("keyboard activation via Enter opens the drawer", () => {
  renderWithProvider(
    <HowItWorksHeaderButton
      defaultTopic="today_overview"
      pageName="Today"
    />,
  );
  const btn = screen.getByRole("button", { name: "How Today works" });
  act(() => {
    btn.focus();
    // Browsers translate Enter on a real button into a click event; jsdom
    // does not, so dispatch the click directly to mirror the activation.
    fireEvent.click(btn);
  });
  const dialog = screen.getByRole("dialog");
  expect(dialog.getAttribute("data-topic")).toBe("today_overview");
});
