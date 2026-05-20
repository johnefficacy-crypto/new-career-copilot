import React from "react";
import { render, screen } from "@testing-library/react";

// The EvidenceDrawer fires a network call on open; stub it so this test
// stays focused on the pyq_option column rendering.
jest.mock("./ExamEvidenceDrawer", () => ({
  __esModule: true,
  default: () => <div data-testid="evidence-drawer-stub" />,
}));

// eslint-disable-next-line global-require
const ReviewQueueTable = require("./ReviewQueueTable").default;

const OPTION_ROWS = [
  {
    id: "opt-1",
    option_label: "A",
    option_text: "Only statement 1 is correct",
    is_correct: false,
    reviewer_status: "pending",
    confidence_score: 0.7,
  },
  {
    id: "opt-2",
    option_label: "B",
    option_text: "1 and 3 only",
    is_correct: true,
    reviewer_status: "pending",
    confidence_score: 0.8,
  },
];

test("renders the pyq_option variant with option + correct columns", () => {
  render(
    <ReviewQueueTable
      items={OPTION_ROWS}
      kind="pyq_option"
      onReview={() => {}}
      busyRowId={null}
    />,
  );
  // Variant-specific headers exist.
  expect(screen.getByText("Option")).toBeTruthy();
  expect(screen.getByText("Correct")).toBeTruthy();
  // Option text + label render.
  expect(screen.getByText("1 and 3 only")).toBeTruthy();
  // is_correct → Yes / No.
  expect(screen.getByText("Yes")).toBeTruthy();
  expect(screen.getByText("No")).toBeTruthy();
});

test("pyq_option rows still expose verify/reject actions", () => {
  render(
    <ReviewQueueTable
      items={OPTION_ROWS}
      kind="pyq_option"
      onReview={() => {}}
      busyRowId={null}
    />,
  );
  // Reuse the shared action buttons — verify present for a pending row.
  expect(screen.getByTestId("exam-intel-review-opt-1-verified")).toBeTruthy();
  expect(screen.getByTestId("exam-intel-review-opt-1-rejected")).toBeTruthy();
});
