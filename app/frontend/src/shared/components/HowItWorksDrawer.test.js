import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";

// Heavy panel children (PlanReasoningCard, StudyPolicyPreview,
// IntelligenceLayersPanel) are mocked because they pull in studyos
// shared UI and we're only asserting drawer + topic-registry plumbing.
jest.mock("../../features/study/components/StudyPolicyPreview", () => () => (
  <div data-testid="mock-study-policy" />
));
jest.mock("../../features/study/components/PlanReasoningCard", () => () => (
  <div data-testid="mock-plan-reasoning" />
));
jest.mock("../../features/study/components/IntelligenceLayersPanel", () => () => (
  <div data-testid="mock-intelligence-layers" />
));

import HowItWorksProvider, { HOW_IT_WORKS_EVENT } from "./HowItWorksProvider";

function renderProvider() {
  return render(
    <HowItWorksProvider>
      <button data-testid="opener">trigger</button>
    </HowItWorksProvider>,
  );
}

function dispatchOpen(topic, data) {
  act(() => {
    window.dispatchEvent(
      new CustomEvent(HOW_IT_WORKS_EVENT, { detail: { topic, data } }),
    );
  });
}

test("drawer is not mounted in the DOM until an open event is dispatched", () => {
  renderProvider();
  expect(screen.queryByTestId("how-it-works-drawer-root")).toBeNull();
});

test("dispatching ccp:how-it-works:open with topic=persona renders the persona explainer", () => {
  renderProvider();
  dispatchOpen("persona");
  const drawer = screen.getByTestId("how-it-works-drawer-root");
  expect(drawer).toBeTruthy();
  expect(drawer.querySelector('[data-topic="persona"]')).toBeTruthy();
  // Title from the topic registry
  expect(screen.getByText("How we read you")).toBeTruthy();
});

test("Escape key closes the drawer", () => {
  renderProvider();
  dispatchOpen("persona");
  expect(screen.getByTestId("how-it-works-drawer-root")).toBeTruthy();
  act(() => {
    fireEvent.keyDown(document, { key: "Escape" });
  });
  expect(screen.queryByTestId("how-it-works-drawer-root")).toBeNull();
});

test("close button closes the drawer", () => {
  renderProvider();
  dispatchOpen("persona");
  fireEvent.click(screen.getByTestId("how-it-works-close"));
  expect(screen.queryByTestId("how-it-works-drawer-root")).toBeNull();
});

test("backdrop click closes the drawer", () => {
  renderProvider();
  dispatchOpen("persona");
  fireEvent.click(screen.getByTestId("how-it-works-backdrop"));
  expect(screen.queryByTestId("how-it-works-drawer-root")).toBeNull();
});

test("dispatching unknown topic shows the generic fallback rather than crashing", () => {
  renderProvider();
  dispatchOpen("nonexistent_topic");
  expect(screen.getByTestId("how-it-works-drawer-root")).toBeTruthy();
  expect(screen.getByText(/explainer hasn't been written/i)).toBeTruthy();
});

test("dispatch with no topic does NOT open the drawer", () => {
  renderProvider();
  dispatchOpen(undefined);
  expect(screen.queryByTestId("how-it-works-drawer-root")).toBeNull();
});

test("study_policy topic renders the policy panel when policy data is passed", () => {
  renderProvider();
  dispatchOpen("study_policy", { policy: { no_late_night_study: true } });
  expect(screen.getByTestId("mock-study-policy")).toBeTruthy();
});

test("plan_reasoning topic renders the reasoning panel when reasoning is non-empty", () => {
  renderProvider();
  dispatchOpen("plan_reasoning", { reasoning: [{ summary: "x" }] });
  expect(screen.getByTestId("mock-plan-reasoning")).toBeTruthy();
});

test("intelligence_layers topic renders the layers panel", () => {
  renderProvider();
  dispatchOpen("intelligence_layers");
  expect(screen.getByTestId("mock-intelligence-layers")).toBeTruthy();
});

test("why_recommendation topic renders reasons + risks when passed", () => {
  renderProvider();
  dispatchOpen("why_recommendation", { reasons: ["Deadline near"], risks: ["Window closing"] });
  expect(screen.getByText("Deadline near")).toBeTruthy();
  expect(screen.getByText("Window closing")).toBeTruthy();
});

test("body scroll is locked while drawer is open and restored on close", () => {
  renderProvider();
  document.body.style.overflow = "";
  dispatchOpen("persona");
  expect(document.body.style.overflow).toBe("hidden");
  fireEvent.click(screen.getByTestId("how-it-works-close"));
  expect(document.body.style.overflow).not.toBe("hidden");
});

test("focus returns to the element that opened the drawer", () => {
  renderProvider();
  const opener = screen.getByTestId("opener");
  opener.focus();
  expect(document.activeElement).toBe(opener);
  dispatchOpen("persona");
  fireEvent.click(screen.getByTestId("how-it-works-close"));
  // The provider uses setTimeout(0) to defer focus restoration.
  return new Promise((resolve) => {
    setTimeout(() => {
      expect(document.activeElement).toBe(opener);
      resolve();
    }, 5);
  });
});
