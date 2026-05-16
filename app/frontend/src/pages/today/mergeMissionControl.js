// Shallow-spreading EMPTY_MC over a partial backend payload wipes nested
// defaults. The mission-control endpoint regularly returns sparse keys
// (e.g. metrics with only a few fields populated) — we want defaults to
// survive at the second level, so callers like `mc.metrics.tasks_completed`
// never read `undefined`.
//
// Arrays are not deep-merged (backend value replaces). Explicit `null` from
// the backend overrides the default (caller asked for null). `undefined`
// falls back to the default.
export function mergeMissionControl(defaults, data) {
  if (!data || typeof data !== "object") return { ...defaults };
  const out = { ...defaults };
  for (const key of Object.keys(data)) {
    const incoming = data[key];
    const fallback = defaults[key];
    if (
      incoming &&
      typeof incoming === "object" &&
      !Array.isArray(incoming) &&
      fallback &&
      typeof fallback === "object" &&
      !Array.isArray(fallback)
    ) {
      out[key] = { ...fallback, ...incoming };
    } else if (incoming === undefined) {
      out[key] = fallback;
    } else {
      out[key] = incoming;
    }
  }
  return out;
}
