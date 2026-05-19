"""Schema-drift aware wrapper for Supabase calls.

Two failure modes must be distinguished:

* **Schema drift** — column missing (PG ``42703``, PostgREST ``PGRST204``),
  relation missing (PG ``42P01``), RPC missing (PostgREST ``PGRST202``).
  These are deployment bugs — the migration hasn't reached this database
  yet, or the code is selecting a column the schema doesn't have.
  Silently swallowing them ships wrong data (see
  ``GET /api/metadata/certifications`` returning ``{items: []}`` while
  Supabase rejected the select with ``42703 column "aliases" does not exist``).
* **Transient errors / row-missing semantics** — network blip, RLS
  filtering, empty result. For these "return default, log warning" is
  correct behaviour and the caller's fallback path is the right answer.

The :class:`SchemaDriftError` exception is raised for the first class
when ``raise_on_schema_error=True`` (the default). Callers that intend
to *persist* after a read must let it propagate so they never write on
a stale default. Read-and-return endpoints that prefer to surface a
default to the UI can pass ``raise_on_schema_error=False`` — they still
get a structured WARNING log with the missing column name so the gap is
visible to operators.

The detection is text-based because supabase-py reports the same
underlying PostgREST/Postgres error through several exception classes
depending on the operation (APIError, PostgrestAPIError, RuntimeError).
We look for the structured codes first and fall back to the human
"does not exist" sentence only when no code is present.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Callable, TypeVar

logger = logging.getLogger("career_copilot.utils.safe")

T = TypeVar("T")

# Order matters: PGRST200/204/202 codes are inspected before the
# generic Postgres "does not exist" fallback so the more specific
# label propagates.
_SCHEMA_DRIFT_CODES = (
    ("42703", "column_missing"),
    ("PGRST204", "column_not_found"),
    ("PGRST202", "rpc_missing"),
    ("42P01", "relation_missing"),
)

# PostgREST's "Could not find the function ..." prose covers cases where
# the structured code is dropped before our layer sees it.
# Accept any combination of unescaped quotes, json-escaped \" or
# nothing wrapping the identifier — supabase-py funnels the error from
# multiple layers (raw Postgres, PostgREST JSON envelope, repr() of an
# exception) so the wrapping varies.
_QUOTE = r"(?:\\\"|[\"'])?"
_DOES_NOT_EXIST_RE = re.compile(
    r"(?:column|relation|function)\s+"
    + _QUOTE
    + r"([A-Za-z0-9_.]+)"
    + _QUOTE
    + r"\s+does not exist",
    re.IGNORECASE,
)
_POSTGREST_NOT_FOUND_RE = re.compile(
    r"Could not find the (?:column|table|function|relationship)\s+"
    + _QUOTE
    + r"([A-Za-z0-9_.]+)"
    + _QUOTE,
    re.IGNORECASE,
)


class SchemaDriftError(RuntimeError):
    """Raised when a Supabase error indicates a missing column/table/RPC."""

    def __init__(self, message: str, *, code: str, missing: str | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.missing = missing

    def __str__(self) -> str:  # pragma: no cover - cosmetic
        base = super().__str__()
        if self.missing:
            return f"[{self.code}] missing={self.missing}: {base}"
        return f"[{self.code}]: {base}"


def _extract_missing(text: str) -> str | None:
    m = _DOES_NOT_EXIST_RE.search(text)
    if m:
        return m.group(1)
    m = _POSTGREST_NOT_FOUND_RE.search(text)
    if m:
        return m.group(1)
    return None


def detect_schema_drift(exc: BaseException) -> tuple[bool, str | None, str | None]:
    """Classify an exception. Returns ``(is_drift, code_label, missing_name)``.

    Detection is intentionally string-based — supabase-py funnels every
    PostgREST/Postgres error through several different exception types
    and only the ``.message`` text is reliably populated across versions.
    """
    text = str(exc) or repr(exc)
    for marker, label in _SCHEMA_DRIFT_CODES:
        if marker in text:
            return True, label, _extract_missing(text)
    # PostgREST sometimes emits the human "does not exist" sentence without
    # a structured code; treat it as drift too so we don't miss the case.
    if "does not exist" in text and ("column" in text or "relation" in text or "function" in text):
        return True, "schema_drift", _extract_missing(text)
    if "Could not find the" in text:
        return True, "schema_drift", _extract_missing(text)
    return False, None, None


def safe_call(
    call: Callable[[], T],
    default: T | None = None,
    *,
    log: logging.Logger | None = None,
    context: str | None = None,
    raise_on_schema_error: bool = True,
) -> T | None:
    """Run ``call`` and translate failures.

    * Schema drift → raise :class:`SchemaDriftError` (default) or log a
      structured WARNING with the missing column name and return ``default``.
    * Any other exception → log a WARNING and return ``default``.
    """
    try:
        return call()
    except SchemaDriftError:
        # Don't double-wrap if a nested call already classified the drift.
        raise
    except Exception as exc:  # noqa: BLE001 - we re-classify below
        is_drift, code, missing = detect_schema_drift(exc)
        if is_drift:
            if raise_on_schema_error:
                raise SchemaDriftError(
                    str(exc), code=code or "schema_drift", missing=missing
                ) from exc
            (log or logger).warning(
                "supabase schema drift code=%s missing=%s context=%s: %s",
                code,
                missing,
                context,
                exc,
            )
            return default
        (log or logger).warning(
            "supabase call failed context=%s: %s",
            context,
            exc,
        )
        return default


__all__ = [
    "SchemaDriftError",
    "detect_schema_drift",
    "safe_call",
]
