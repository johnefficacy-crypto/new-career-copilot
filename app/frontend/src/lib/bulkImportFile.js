/**
 * Tiny CSV parser for the admin bulk-import surfaces.
 *
 * Handles the RFC-4180 essentials so admins can drop in a spreadsheet
 * export without converting it to JSON first:
 *   - header row → object keys
 *   - quoted fields with embedded commas
 *   - quoted fields with embedded newlines
 *   - escaped quotes ("" → ")
 *   - empty cell → null
 *   - cells that look like JSON ([] or {} or numbers/booleans) are
 *     parsed so nested ``vacancy_by_category`` jsonb columns drop in
 *     cleanly as objects rather than strings.
 *
 * Returns ``{ rows: Array<object>, errors: Array<string> }``. Never
 * throws. Caller is responsible for sending ``rows`` to the bulk-import
 * endpoint exactly as it would for a JSON paste.
 *
 * Not a full csv-parse replacement — no streaming, no callbacks, no
 * exotic dialects. Good enough for the typical exam-intel ingest CSV
 * (under a few thousand rows) and avoids a heavyweight dep.
 */

function tokenize(text) {
  // Walk the text char-by-char, emitting cells and rows. Quoted fields
  // are reproduced verbatim except for the surrounding quotes and the
  // "" → " unescape.
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\r" && text[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 2;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function coerce(value) {
  if (value === "" || value == null) return null;
  const trimmed = String(value).trim();
  if (trimmed === "") return null;
  // Booleans (case-insensitive).
  if (trimmed.toLowerCase() === "true") return true;
  if (trimmed.toLowerCase() === "false") return false;
  // Numbers — integers + decimals. Reject "001" so it stays a string
  // (zip-code-like values shouldn't lose their leading zero).
  if (/^-?\d+(\.\d+)?$/.test(trimmed) && !/^-?0\d+/.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isFinite(n)) return n;
  }
  // Nested JSON — only when it looks like one.
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Fall through and keep it as a string so the admin can fix the typo.
    }
  }
  return trimmed;
}

export function parseCsvToRows(text) {
  const errors = [];
  if (typeof text !== "string" || !text.trim()) {
    return { rows: [], errors: ["empty input"] };
  }
  const tokens = tokenize(text).filter((r) => r.some((c) => c !== ""));
  if (tokens.length === 0) {
    return { rows: [], errors: ["no data rows"] };
  }
  const header = tokens[0].map((h) => String(h).trim());
  if (header.some((h) => !h)) {
    return { rows: [], errors: ["header row has empty column name"] };
  }
  const rows = [];
  for (let r = 1; r < tokens.length; r += 1) {
    const cells = tokens[r];
    if (cells.length !== header.length) {
      errors.push(
        `row ${r + 1}: expected ${header.length} columns, got ${cells.length}`,
      );
      continue;
    }
    const obj = {};
    for (let c = 0; c < header.length; c += 1) {
      obj[header[c]] = coerce(cells[c]);
    }
    rows.push(obj);
  }
  return { rows, errors };
}

export function parseImportFile(filename, text) {
  const lower = (filename || "").toLowerCase();
  if (lower.endsWith(".csv")) {
    return parseCsvToRows(text);
  }
  if (lower.endsWith(".json")) {
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        return { rows: [], errors: ["JSON top-level must be an array of row objects"] };
      }
      return { rows: parsed, errors: [] };
    } catch (e) {
      return { rows: [], errors: [`could not parse JSON: ${e.message}`] };
    }
  }
  return {
    rows: [],
    errors: [
      `unsupported file extension on ${filename}. Use .csv or .json (PDF/MD ingest is a separate pipeline).`,
    ],
  };
}
