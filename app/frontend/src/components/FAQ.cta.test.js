import fs from "fs";
import path from "path";

const FAQ_SRC = fs.readFileSync(path.resolve(__dirname, "FAQ.jsx"), "utf8");

// FAQ "Jump into the dashboard" CTA must mint an anonymous session,
// otherwise we end up at /app without auth and downstream onboarding
// calls 401.
test("faq CTA does not link directly to /app", () => {
  expect(FAQ_SRC).not.toMatch(/<Link[^>]+to="\/app"[^>]+data-testid="faq-cta"/);
  expect(FAQ_SRC).not.toMatch(/data-testid="faq-cta"[^>]*to="\/app"/);
});

test("faq CTA renders StartFreeButton", () => {
  expect(FAQ_SRC).toMatch(/import StartFreeButton from "\.\/StartFreeButton"/);
  expect(FAQ_SRC).toMatch(/<StartFreeButton[\s\S]*?testId="faq-cta"/);
});
