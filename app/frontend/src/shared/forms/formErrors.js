export function normalizeFormErrors(errorLike) {
  if (!errorLike) return {};

  if (errorLike.flatten && typeof errorLike.flatten === 'function') {
    const flattened = errorLike.flatten();
    return Object.fromEntries(Object.entries(flattened.fieldErrors || {}).map(([k, arr]) => [k, arr?.[0] || 'Invalid value']));
  }

  if (errorLike.errors && Array.isArray(errorLike.errors)) {
    return Object.fromEntries(errorLike.errors.map((e) => [e.path?.[0] || 'form', e.message || 'Invalid value']));
  }

  return Object.fromEntries(Object.entries(errorLike).map(([k, v]) => [k, v?.message || v || 'Invalid value']));
}
