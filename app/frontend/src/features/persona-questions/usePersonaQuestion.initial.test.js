// `usePersonaQuestion({ initialQuestion })` must skip the
// `/api/persona/questions/next` fetch when the caller passes in a
// hydrated question (mission-control already returned one).

const mockGet = jest.fn();

jest.mock("../../lib/api", () => ({
  __esModule: true,
  api: { get: (...a) => mockGet(...a), post: jest.fn() },
}));

import { renderHook, waitFor } from "@testing-library/react";
import { usePersonaQuestion } from "./usePersonaQuestion";

beforeEach(() => {
  mockGet.mockReset();
});

const SEEDED = {
  question_key: "mock_behavior",
  question_text: "How do you handle mocks?",
  data_type: "single_select",
  options: [],
};

test("hook hydrates from initialQuestion and skips the GET", async () => {
  const { result } = renderHook(() => usePersonaQuestion({ initialQuestion: SEEDED }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.question).toEqual(SEEDED);
  expect(mockGet).not.toHaveBeenCalledWith("/api/persona/questions/next");
});

test("hook falls back to fetching when no initial question is passed", async () => {
  mockGet.mockResolvedValueOnce({ question: SEEDED, reason: "x" });
  const { result } = renderHook(() => usePersonaQuestion());
  await waitFor(() => expect(result.current.question).toEqual(SEEDED));
  expect(mockGet).toHaveBeenCalledWith("/api/persona/questions/next");
});

test("hook hydrates with null initialQuestion and still skips fetch", async () => {
  const { result } = renderHook(() => usePersonaQuestion({ initialQuestion: null }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.question).toBeNull();
  expect(mockGet).not.toHaveBeenCalledWith("/api/persona/questions/next");
});
