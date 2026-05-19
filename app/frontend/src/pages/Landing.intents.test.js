import fs from "fs";
import path from "path";

// Mirror of backend `app/backend/app/onboarding_unified/entry_resolver.py`:
//   COLD_INTENTS and _INTENT_ALIASES. If the backend list moves, this
//   snapshot must move with it — the test will fail loudly if landing CTAs
//   emit a value that neither set accepts.
const COLD_INTENTS = new Set([
  "check_eligibility",
  "prepare_exam",
  "track_deadlines",
  "join_study_group",
  "guide_me",
]);

const INTENT_ALIASES = new Set([
  "find_jobs",
  "find_eligible_jobs",
  "eligibility",
  "check_eligibility",
  "documents",
  "documents_required",
  "deadlines",
  "track_deadlines",
  "study_group",
  "join_study_group",
  "study_plan",
  "start_study_plan",
  "prepare_exam",
  "guide_me",
]);

const LANDING_SRC = fs.readFileSync(
  path.resolve(__dirname, "Landing.jsx"),
  "utf8",
);

test("every intent= value emitted by Landing.jsx maps to a valid backend cold intent", () => {
  const re = /intent=([a-zA-Z_][a-zA-Z0-9_]*)/g;
  const seen = new Set();
  for (const m of LANDING_SRC.matchAll(re)) {
    seen.add(m[1]);
  }
  // Sanity: the landing page must emit at least one intent — otherwise the
  // regex above silently passes a future refactor that breaks all CTAs.
  expect(seen.size).toBeGreaterThan(0);
  const unknown = [...seen].filter(
    (v) => !COLD_INTENTS.has(v) && !INTENT_ALIASES.has(v),
  );
  expect(unknown).toEqual([]);
});

test("no occurrences of the legacy invalid intent values", () => {
  expect(LANDING_SRC).not.toMatch(/intent=create_study_plan\b/);
  expect(LANDING_SRC).not.toMatch(/intent=join_group\b/);
});
