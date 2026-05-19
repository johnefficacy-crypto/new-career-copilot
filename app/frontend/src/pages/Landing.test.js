import fs from "fs";
import path from "path";

const LANDING_SRC = fs.readFileSync(
  path.resolve(__dirname, "Landing.jsx"),
  "utf8",
);

// Lines that contain one of the 5 audit-cited proof numbers and that are
// NOT in the same JSX element as a clearly-labeled "Example" pill.
// Acceptance criterion for PR-D: every proof number on landing is either
// removed or wrapped in an Example badge using the existing pill primitive.
const PROOF_PATTERNS = [
  /184 verified topics/,
  /14 recruitments/,
  /0 aggregator items applied silently/,
  /41 signals/,
  /7 rules fired/,
  /verified criteria/,
  /rules per match/,
];

function isInsideExampleBlock(line, allLines, idx) {
  // Walk back to find the nearest opening JSX element and confirm an
  // "Example" pill sibling appears within ~8 lines either side.
  const start = Math.max(0, idx - 12);
  const end = Math.min(allLines.length - 1, idx + 12);
  for (let i = start; i <= end; i += 1) {
    if (/pill-outline[^"]*">Example<\/span>/.test(allLines[i])) return true;
  }
  return false;
}

test("no proof number on landing renders outside an Example wrapper", () => {
  const lines = LANDING_SRC.split("\n");
  const offenders = [];
  lines.forEach((line, idx) => {
    PROOF_PATTERNS.forEach((re) => {
      if (re.test(line) && !isInsideExampleBlock(line, lines, idx)) {
        offenders.push(`${idx + 1}: ${line.trim()}`);
      }
    });
  });
  expect(offenders).toEqual([]);
});

test("the Stat component renders an Example badge", () => {
  expect(LANDING_SRC).toMatch(/data-testid="landing-stat"/);
  // The Example pill is rendered inside the Stat component
  const statMatch = LANDING_SRC.match(/function Stat\([^)]*\)\s*{[\s\S]*?return[\s\S]*?<\/div>\s*\);\s*}/);
  expect(statMatch).toBeTruthy();
  expect(statMatch[0]).toMatch(/>Example</);
});
