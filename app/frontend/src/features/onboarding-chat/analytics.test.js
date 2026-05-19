import { trackOnboardingEvent } from "./analytics";

describe("trackOnboardingEvent", () => {
  beforeEach(() => {
    window.dataLayer = [];
  });

  it("pushes onboarding analytics event into dataLayer", () => {
    trackOnboardingEvent("question_shown", { question_key: "q1" });
    expect(window.dataLayer).toHaveLength(1);
    expect(window.dataLayer[0]).toMatchObject({
      event: "onboarding_unified",
      event_type: "question_shown",
      payload: { question_key: "q1" },
    });
  });
});
