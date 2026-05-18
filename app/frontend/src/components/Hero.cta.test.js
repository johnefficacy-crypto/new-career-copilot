import fs from "fs";
import path from "path";

const HERO_SRC = fs.readFileSync(path.resolve(__dirname, "Hero.jsx"), "utf8");

// Hero must route through the anonymous Supabase sign-in flow.
// A bare <Link to="/app"> skips signInAnonymously, which leaves
// /api/profile/onboarding-next without an Authorization header and
// returns 401.
test("hero CTA does not link directly to /app", () => {
  expect(HERO_SRC).not.toMatch(/<Link[^>]+to="\/app"[^>]+data-testid="hero-start-button"/);
  expect(HERO_SRC).not.toMatch(/data-testid="hero-start-button"[^>]*to="\/app"/);
});

test("hero CTA renders StartFreeButton", () => {
  expect(HERO_SRC).toMatch(/import StartFreeButton from "\.\/StartFreeButton"/);
  expect(HERO_SRC).toMatch(/<StartFreeButton[\s\S]*?testId="hero-start-button"/);
});
