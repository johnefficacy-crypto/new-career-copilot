import { validateMockForm } from "./validateMockForm";

const VALID = {
  name: "SSC CGL Tier 1 Mock 3",
  exam_slug: "ssc-cgl-2026",
  max_score: 200,
  score: 153,
  duration_min: 60,
  attempted: 95,
  correct: 80,
};

test("accepts a complete, sensible form", () => {
  expect(validateMockForm(VALID)).toEqual({ ok: true, message: "" });
});

test("accepts string inputs (form inputs are strings)", () => {
  expect(
    validateMockForm({
      ...VALID,
      max_score: "200",
      score: "153",
      attempted: "95",
      correct: "80",
      duration_min: "60",
    }),
  ).toEqual({ ok: true, message: "" });
});

test("rejects empty form", () => {
  expect(validateMockForm(null).ok).toBe(false);
  expect(validateMockForm({}).ok).toBe(false);
});

test("rejects missing name and missing exam_slug", () => {
  expect(validateMockForm({ ...VALID, name: "" }).message).toMatch(/name/i);
  expect(validateMockForm({ ...VALID, name: "   " }).message).toMatch(/name/i);
  expect(validateMockForm({ ...VALID, exam_slug: "" }).message).toMatch(/exam/i);
});

test("rejects non-positive max_score and duration", () => {
  expect(validateMockForm({ ...VALID, max_score: 0 }).message).toMatch(/max score/i);
  expect(validateMockForm({ ...VALID, max_score: -10 }).message).toMatch(/max score/i);
  expect(validateMockForm({ ...VALID, max_score: "garbage" }).message).toMatch(/max score/i);
  expect(validateMockForm({ ...VALID, duration_min: 0 }).message).toMatch(/duration/i);
});

test("rejects score > max_score (the silent-bar-overflow bug)", () => {
  const r = validateMockForm({ ...VALID, score: 250, max_score: 200 });
  expect(r.ok).toBe(false);
  expect(r.message).toMatch(/score.*250.*max score.*200/i);
});

test("rejects negative score", () => {
  expect(validateMockForm({ ...VALID, score: -1 }).message).toMatch(/score/i);
});

test("rejects correct > attempted", () => {
  const r = validateMockForm({ ...VALID, correct: 100, attempted: 80 });
  expect(r.ok).toBe(false);
  expect(r.message).toMatch(/correct.*100.*attempted.*80/i);
});

test("rejects negative attempted and negative correct", () => {
  expect(validateMockForm({ ...VALID, attempted: -1 }).message).toMatch(/attempted/i);
  expect(validateMockForm({ ...VALID, correct: -1 }).message).toMatch(/correct/i);
});

test("accepts correct = attempted (boundary)", () => {
  expect(validateMockForm({ ...VALID, correct: 50, attempted: 50 }).ok).toBe(true);
});

test("accepts score = max_score (boundary)", () => {
  expect(validateMockForm({ ...VALID, score: 200, max_score: 200 }).ok).toBe(true);
});

test("accepts zero score / zero correct (the legitimate-zero case)", () => {
  expect(validateMockForm({ ...VALID, score: 0, correct: 0 }).ok).toBe(true);
});
