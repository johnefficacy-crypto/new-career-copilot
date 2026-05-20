import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";

const mockGet = jest.fn();
jest.mock("../../../lib/api", () => ({
  __esModule: true,
  api: { get: (...a) => mockGet(...a) },
}));

// eslint-disable-next-line global-require
const ExamEvidenceDrawer = require("./ExamEvidenceDrawer").default;

beforeEach(() => {
  mockGet.mockReset();
});

test("fires GET /api/evidence/<kind>/<id> on mount", async () => {
  mockGet.mockResolvedValue({
    kind: "pyq_option",
    id: "opt-1",
    row: {
      question_id: "q-1",
      option_label: "B",
      option_text: "1 and 3 only",
      is_correct: true,
    },
    trust: { status: "verified", confidence_score: null, reviewed_at: "2026-04-02" },
  });

  render(
    <ExamEvidenceDrawer
      row={{ id: "opt-1", reviewer_status: "verified" }}
      kind="pyq_option"
      defaultOpen
    />,
  );

  await waitFor(() =>
    expect(mockGet).toHaveBeenCalledWith("/api/evidence/pyq_option/opt-1"),
  );
  // Renders fields the backend returned.
  await screen.findByText("1 and 3 only");
});

test("renders only backend-returned fields — no invented fallbacks", async () => {
  mockGet.mockResolvedValue({
    kind: "syllabus_topic_mention",
    id: "m-1",
    row: { raw_text: "Quantitative Aptitude — Percentage", mention_type: "explicit" },
    trust: { status: "verified", confidence_score: 0.9, reviewed_at: null },
  });

  render(
    <ExamEvidenceDrawer
      row={{ id: "m-1", reviewer_status: "verified" }}
      kind="syllabus_topic_mention"
      defaultOpen
    />,
  );

  await screen.findByText("Quantitative Aptitude — Percentage");
  // A field the backend did NOT return must not appear.
  expect(screen.queryByText(/source_doc_id/i)).toBeNull();
});

test("surfaces a load error instead of silently rendering blank", async () => {
  mockGet.mockRejectedValue(new Error("evidence row not found"));

  render(
    <ExamEvidenceDrawer
      row={{ id: "missing", reviewer_status: "pending" }}
      kind="pyq_question"
      defaultOpen
    />,
  );

  await waitFor(() => expect(mockGet).toHaveBeenCalled());
  await screen.findByText(/Could not load evidence/i);
});
