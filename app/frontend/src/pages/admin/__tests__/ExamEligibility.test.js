import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockDel = jest.fn();

jest.mock("../../../lib/api", () => ({
  __esModule: true,
  api: {
    get: (...args) => mockGet(...args),
    post: (...args) => mockPost(...args),
    put: (...args) => mockPut(...args),
    del: (...args) => mockDel(...args),
  },
}));

jest.mock("../../../shared/ui", () => ({
  __esModule: true,
  LoadingSkeleton: () => null,
}));

import AdminExamEligibility from "../ExamEligibility";

const EXAM_A = "11111111-1111-4111-8111-111111111111";
const EXAM_B = "22222222-2222-4222-8222-222222222222";
const RULE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function seedListsApi() {
  mockGet.mockImplementation((path) => {
    if (path === "/api/admin/exam-eligibility/exams") {
      return Promise.resolve({
        items: [
          {
            id: EXAM_A,
            slug: "ssc-cgl",
            name: "SSC CGL",
            is_active: true,
            rule_counts: { draft: 1, verified: 2, archived: 0 },
            total_rules: 3,
          },
          {
            id: EXAM_B,
            slug: "upsc-cse",
            name: "UPSC CSE",
            is_active: true,
            rule_counts: { draft: 0, verified: 0, archived: 0 },
            total_rules: 0,
          },
        ],
      });
    }
    if (path === `/api/admin/exam-eligibility/exams/${EXAM_A}/rules`) {
      return Promise.resolve({
        exam: { id: EXAM_A, slug: "ssc-cgl", name: "SSC CGL" },
        rules: [
          {
            id: RULE_A,
            scope: "all",
            rule_type: "age_min",
            value_num: 18,
            value_text: null,
            is_knockout: true,
            source_url: "https://ssc.gov.in/",
            source_notes: null,
            reviewer_status: "verified",
          },
        ],
      });
    }
    return Promise.resolve({});
  });
}

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockPut.mockReset();
  mockDel.mockReset();
});

test("renders the exam list with rule counts on mount", async () => {
  seedListsApi();
  await act(async () => {
    render(
      <MemoryRouter>
        <AdminExamEligibility />
      </MemoryRouter>,
    );
  });
  await waitFor(() => {
    expect(screen.getByTestId("exam-row-ssc-cgl")).toBeTruthy();
  });
  const row = screen.getByTestId("exam-row-ssc-cgl");
  expect(row.textContent).toMatch(/SSC CGL/);
  expect(row.textContent).toMatch(/2 verified/);
  expect(row.textContent).toMatch(/1 draft/);
});

test("selecting an exam loads its rules table", async () => {
  seedListsApi();
  await act(async () => {
    render(
      <MemoryRouter>
        <AdminExamEligibility />
      </MemoryRouter>,
    );
  });
  await waitFor(() => expect(screen.getByTestId("exam-row-ssc-cgl")).toBeTruthy());
  await act(async () => {
    fireEvent.click(screen.getByTestId("exam-row-ssc-cgl"));
  });
  await waitFor(() => expect(screen.getByTestId(`rule-row-${RULE_A}`)).toBeTruthy());
  expect(mockGet).toHaveBeenCalledWith(
    `/api/admin/exam-eligibility/exams/${EXAM_A}/rules`,
  );
  // Verified rule shows the verified pill and no verify button.
  expect(screen.getByTestId("status-verified")).toBeTruthy();
  expect(screen.queryByTestId(`verify-${RULE_A}`)).toBeNull();
});

test("verify button on a draft rule posts a status update", async () => {
  mockGet.mockImplementation((path) => {
    if (path === "/api/admin/exam-eligibility/exams") {
      return Promise.resolve({
        items: [
          {
            id: EXAM_A,
            slug: "ssc-cgl",
            name: "SSC CGL",
            is_active: true,
            rule_counts: { draft: 1, verified: 0, archived: 0 },
            total_rules: 1,
          },
        ],
      });
    }
    if (path === `/api/admin/exam-eligibility/exams/${EXAM_A}/rules`) {
      return Promise.resolve({
        exam: { id: EXAM_A, slug: "ssc-cgl", name: "SSC CGL" },
        rules: [
          {
            id: RULE_A,
            scope: "all",
            rule_type: "age_min",
            value_num: 18,
            reviewer_status: "draft",
          },
        ],
      });
    }
    return Promise.resolve({});
  });
  mockPut.mockResolvedValue({ rule: { id: RULE_A, reviewer_status: "verified" } });

  await act(async () => {
    render(
      <MemoryRouter>
        <AdminExamEligibility />
      </MemoryRouter>,
    );
  });
  await waitFor(() => expect(screen.getByTestId("exam-row-ssc-cgl")).toBeTruthy());
  await act(async () => {
    fireEvent.click(screen.getByTestId("exam-row-ssc-cgl"));
  });
  await waitFor(() => expect(screen.getByTestId(`verify-${RULE_A}`)).toBeTruthy());
  await act(async () => {
    fireEvent.click(screen.getByTestId(`verify-${RULE_A}`));
  });
  expect(mockPut).toHaveBeenCalledWith(
    `/api/admin/exam-eligibility/rules/${RULE_A}`,
    { reviewer_status: "verified" },
  );
});

test("rule form rejects numeric type with no numeric value", async () => {
  seedListsApi();
  await act(async () => {
    render(
      <MemoryRouter>
        <AdminExamEligibility />
      </MemoryRouter>,
    );
  });
  await waitFor(() => expect(screen.getByTestId("exam-row-ssc-cgl")).toBeTruthy());
  await act(async () => {
    fireEvent.click(screen.getByTestId("exam-row-ssc-cgl"));
  });
  await waitFor(() => expect(screen.getByTestId("new-rule-btn")).toBeTruthy());
  await act(async () => {
    fireEvent.click(screen.getByTestId("new-rule-btn"));
  });
  // Form defaults to (scope=all, rule_type=age_max); leave the numeric field empty.
  await act(async () => {
    fireEvent.click(screen.getByTestId("rule-form-submit"));
  });
  await waitFor(() => {
    expect(screen.getByTestId("admin-exam-eligibility-error").textContent).toMatch(
      /numeric value/,
    );
  });
  expect(mockPost).not.toHaveBeenCalled();
});
