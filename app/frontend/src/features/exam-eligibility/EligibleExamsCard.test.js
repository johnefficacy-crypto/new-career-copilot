/* eslint-env jest */
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockGet = jest.fn();

jest.mock("../../lib/api", () => ({
  __esModule: true,
  api: { get: (...args) => mockGet(...args) },
}));

// Freeze the motion components so the assertions don't have to wait for
// real spring/transition timing in jsdom.
jest.mock("framer-motion", () => {
  const React = require("react");
  const STRIP = new Set(["initial", "animate", "exit", "transition", "whileHover", "whileTap"]);
  function clean(props) {
    if (!props) return props;
    const out = {};
    for (const k of Object.keys(props)) {
      if (!STRIP.has(k)) out[k] = props[k];
    }
    return out;
  }
  return {
    __esModule: true,
    AnimatePresence: ({ children }) => React.createElement(React.Fragment, null, children),
    motion: new Proxy(
      {},
      {
        get: () => (props) =>
          React.createElement("div", clean(props), props.children),
      },
    ),
  };
});

import EligibleExamsCard from "./EligibleExamsCard";

const EXAM_A = "11111111-1111-4111-8111-111111111111";
const EXAM_B = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  mockGet.mockReset();
});

function renderCard(variant = "card") {
  return render(
    <MemoryRouter>
      <EligibleExamsCard variant={variant} />
    </MemoryRouter>,
  );
}

test("loading state shows skeleton without count placeholders", async () => {
  mockGet.mockReturnValue(new Promise(() => {})); // never resolves
  renderCard();
  // The eyebrow renders, but no <CountTile> with a fake number is shown.
  expect(screen.queryByTestId("tile-eligible")).toBeNull();
  expect(screen.queryByTestId("tile-conditional")).toBeNull();
});

test("empty state asks for profile fields rather than showing a zero", async () => {
  mockGet.mockResolvedValue({
    eligible: [],
    conditional: [],
    not_eligible: [],
    unknown: [],
    rule_count: 12,
  });
  await act(async () => {
    renderCard();
  });
  await waitFor(() => expect(screen.getByTestId("eligible-exams-empty-cta")).toBeTruthy());
  // No count tiles when there's nothing real to count.
  expect(screen.queryByTestId("tile-eligible")).toBeNull();
  expect(screen.queryByTestId("tile-conditional")).toBeNull();
  // Explicit honest empty copy.
  expect(screen.getByText(/Add your date of birth/i)).toBeTruthy();
});

test("renders eligible count and chip when backend reports real items", async () => {
  mockGet.mockResolvedValue({
    eligible: [
      { exam_id: EXAM_A, slug: "ssc-cgl", name: "SSC CGL", reasons: [], missing_fields: [] },
    ],
    conditional: [],
    not_eligible: [],
    unknown: [],
    rule_count: 6,
  });
  await act(async () => {
    renderCard();
  });
  await waitFor(() => expect(screen.getByTestId("tile-eligible")).toBeTruthy());
  expect(screen.getByTestId("tile-eligible").textContent).toMatch(/1/);
  expect(screen.queryByTestId("tile-conditional")).toBeNull();
  expect(screen.getByTestId("exam-row-ssc-cgl").getAttribute("data-tone")).toBe("eligible");
});

test("conditional-only response never claims confirmed eligibility", async () => {
  mockGet.mockResolvedValue({
    eligible: [],
    conditional: [
      {
        exam_id: EXAM_A,
        slug: "ssc-cgl",
        name: "SSC CGL",
        reasons: [],
        missing_fields: ["date_of_birth"],
      },
    ],
    not_eligible: [],
    unknown: [],
    rule_count: 6,
  });
  await act(async () => {
    renderCard();
  });
  await waitFor(() => expect(screen.getByTestId("tile-conditional")).toBeTruthy());
  expect(screen.queryByTestId("tile-eligible")).toBeNull();
  // Tile label and chip both read "Likely", not "Eligible".
  expect(screen.getByTestId("tile-conditional").textContent).toMatch(/Likely/i);
  const row = screen.getByTestId("exam-row-ssc-cgl");
  expect(row.getAttribute("data-tone")).toBe("conditional");
  expect(row.textContent).toMatch(/Likely/);
  expect(row.textContent).not.toMatch(/\bEligible\b/);
  // Asks for the missing field by friendly name.
  expect(row.textContent).toMatch(/date of birth/);
});

test("expanding an eligible row reveals the source-of-truth detail", async () => {
  mockGet.mockResolvedValue({
    eligible: [
      { exam_id: EXAM_A, slug: "ssc-cgl", name: "SSC CGL", reasons: [], missing_fields: [] },
    ],
    conditional: [],
    not_eligible: [],
    unknown: [],
    rule_count: 6,
  });
  await act(async () => {
    renderCard();
  });
  await waitFor(() => expect(screen.getByTestId("exam-row-ssc-cgl")).toBeTruthy());
  const row = screen.getByTestId("exam-row-ssc-cgl");
  const toggle = row.querySelector("button");
  await act(async () => {
    fireEvent.click(toggle);
  });
  await waitFor(() =>
    expect(screen.getByText(/All baseline rules/i)).toBeTruthy(),
  );
});

test("error response surfaces honestly with a retry, never a silent zero", async () => {
  mockGet.mockRejectedValue(new Error("boom"));
  await act(async () => {
    renderCard();
  });
  await waitFor(() => expect(screen.getByTestId("eligible-exams-retry")).toBeTruthy());
  expect(screen.queryByTestId("tile-eligible")).toBeNull();
  expect(screen.queryByTestId("tile-conditional")).toBeNull();
});

test("backend error tag is treated as an error, not as zero counts", async () => {
  mockGet.mockResolvedValue({
    eligible: [],
    conditional: [],
    not_eligible: [],
    unknown: [],
    rule_count: 0,
    error: "summary_unavailable",
  });
  await act(async () => {
    renderCard();
  });
  await waitFor(() => expect(screen.getByTestId("eligible-exams-retry")).toBeTruthy());
});

test("renders the onboarding panel variant when requested", async () => {
  mockGet.mockResolvedValue({
    eligible: [
      { exam_id: EXAM_A, slug: "ssc-cgl", name: "SSC CGL", reasons: [], missing_fields: [] },
    ],
    conditional: [],
    not_eligible: [],
    unknown: [],
    rule_count: 6,
  });
  await act(async () => {
    renderCard("panel");
  });
  await waitFor(() => expect(screen.getByTestId("eligible-exams-panel")).toBeTruthy());
  expect(screen.queryByTestId("eligible-exams-card")).toBeNull();
});

test("shows admin-side empty copy when no rules are published yet", async () => {
  mockGet.mockResolvedValue({
    eligible: [],
    conditional: [],
    not_eligible: [],
    unknown: [],
    rule_count: 0,
  });
  await act(async () => {
    renderCard();
  });
  await waitFor(() =>
    expect(screen.getByText(/haven't published baseline eligibility rules/i)).toBeTruthy(),
  );
  // Never asks the user to fix their profile when the gap is admin-side.
  expect(screen.queryByTestId("eligible-exams-empty-cta")).toBeNull();
});
