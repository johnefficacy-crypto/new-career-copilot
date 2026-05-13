// Single contract for displaying scrape quality / confidence scores.
//
// Backend writes both `confidence_score` and `data_quality_score` as floats
// in [0.0, 1.0] (normalize_recruitment clamps to that range as of 0be02d2).
// Older queue rows may still carry pre-clamp values up to ~1.2, so every
// reader clamps defensively before rendering.
//
// Render contract: integer percentage (e.g. "85%"). Sort order keeps the
// raw float because back-end orders by it directly.

export const QUALITY_LOW_THRESHOLD_PCT = 60;

export function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

export function scoreToPct(value) {
  const clamped = clampScore(value);
  if (clamped == null) return null;
  return Math.round(clamped * 100);
}

export function formatScorePct(value) {
  const pct = scoreToPct(value);
  return pct == null ? "-" : `${pct}%`;
}

export function isLowQuality(value) {
  const pct = scoreToPct(value);
  return pct != null && pct < QUALITY_LOW_THRESHOLD_PCT;
}
