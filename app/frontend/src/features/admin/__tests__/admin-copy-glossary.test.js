// Locks the PR-A copy glossary: the listed legacy strings must not reappear
// in admin user-facing source. Backend payload literals and audit-log enums
// live in app/backend and are out of scope for this lint.
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");
const ADMIN_DIRS = [
  path.join(ROOT, "pages", "admin"),
  path.join(ROOT, "features", "admin"),
];

const FORBIDDEN = [
  "Official source resolved",
  "Resolve official source",
  "Promoted draft",
  "Eligibility monitored",
  "Queue Review",
  "Operations Console",
  "Scrape Runs",
  "Eligibility Ops",
  "RBAC & Users",
  "AI Policy",
];

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (/\.(jsx?|tsx?)$/.test(entry.name) && !/\.test\.[jt]sx?$/.test(entry.name)) {
      yield full;
    }
  }
}

test("legacy admin copy glossary terms are not present in admin source", () => {
  const hits = [];
  for (const dir of ADMIN_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const file of walk(dir)) {
      const text = fs.readFileSync(file, "utf8");
      for (const term of FORBIDDEN) {
        if (text.includes(term)) {
          hits.push(`${path.relative(ROOT, file)} :: ${term}`);
        }
      }
    }
  }
  expect(hits).toEqual([]);
});
