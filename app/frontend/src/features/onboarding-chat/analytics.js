export function trackOnboardingEvent(eventType, payload = {}) {
  const event = {
    event: "onboarding_unified",
    event_type: eventType,
    payload,
    ts: new Date().toISOString(),
  };

  if (typeof window !== "undefined" && Array.isArray(window.dataLayer)) {
    window.dataLayer.push(event);
  }

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.debug("[onboarding-analytics]", event);
  }
}
