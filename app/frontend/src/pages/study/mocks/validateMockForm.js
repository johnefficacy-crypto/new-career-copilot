// Pure validator for the Mocks "Log mock" form. Pulled out of Mocks.jsx so
// the rules are testable without React. Caller is expected to render the
// returned `message` inline; `ok=true` short-circuits to a no-op message.
//
// Rules:
//   * name, exam_slug, max_score, duration_min, attempted, correct, score are required.
//   * max_score must be > 0.
//   * duration_min must be > 0.
//   * score in [0, max_score].
//   * attempted >= 0.
//   * correct in [0, attempted].
//
// Empty error-pattern counts are valid; this validator does not touch them.

function toNumber(v) {
  if (v === "" || v === null || v === undefined) return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export function validateMockForm(form) {
  if (!form || typeof form !== "object") {
    return { ok: false, message: "Form is empty." };
  }
  const name = (form.name || "").trim();
  if (!name) return { ok: false, message: "Give the mock a name." };
  if (!form.exam_slug) return { ok: false, message: "Pick the exam this mock is for." };

  const maxScore = toNumber(form.max_score);
  const score = toNumber(form.score);
  const duration = toNumber(form.duration_min);
  const attempted = toNumber(form.attempted);
  const correct = toNumber(form.correct);

  if (Number.isNaN(maxScore) || maxScore <= 0) {
    return { ok: false, message: "Max score must be a positive number." };
  }
  if (Number.isNaN(duration) || duration <= 0) {
    return { ok: false, message: "Duration must be a positive number of minutes." };
  }
  if (Number.isNaN(score) || score < 0) {
    return { ok: false, message: "Score must be 0 or higher." };
  }
  if (score > maxScore) {
    return {
      ok: false,
      message: `Score (${score}) can't exceed max score (${maxScore}).`,
    };
  }
  if (Number.isNaN(attempted) || attempted < 0) {
    return { ok: false, message: "Attempted questions must be 0 or higher." };
  }
  if (Number.isNaN(correct) || correct < 0) {
    return { ok: false, message: "Correct answers must be 0 or higher." };
  }
  if (correct > attempted) {
    return {
      ok: false,
      message: `Correct (${correct}) can't exceed attempted (${attempted}).`,
    };
  }
  return { ok: true, message: "" };
}
