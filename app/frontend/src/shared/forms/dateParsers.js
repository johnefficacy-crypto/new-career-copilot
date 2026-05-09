export function parseDateString(value) {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

export function validateDOBRange(value, { minYear = 1940, minAge = 12 } = {}) {
  const parsed = parseDateString(value);
  if (!parsed) return false;
  const dob = new Date(parsed);
  const now = new Date();
  const minDate = new Date(minYear, 0, 1);
  const latestAllowed = new Date(now.getFullYear() - minAge, now.getMonth(), now.getDate());
  return dob >= minDate && dob <= latestAllowed;
}
