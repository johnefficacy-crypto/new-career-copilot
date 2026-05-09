export function parseOptionalNumber(value) {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function parseRequiredNumber(value, fieldName = "value") {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${fieldName} must be a valid number`);
  return n;
}

export function parseYear(value, { min = 1900, max = new Date().getFullYear() + 10 } = {}) {
  if (value == null || value === "") return undefined;
  const y = parseRequiredNumber(value, "year");
  if (!Number.isInteger(y) || y < min || y > max) throw new Error(`year must be between ${min} and ${max}`);
  return y;
}
