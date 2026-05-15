"""Deterministic snapshot hashing for verification reports.

A verification report has up to two snapshot hashes:

* ``source_snapshot_hash`` — hash of the scraped/extracted payload.
  Used to detect "is this scrape materially identical to the one we
  already classified?" Yes → noop; no → new report version.
* ``canonical_snapshot_hash`` — hash of the recruitment row + its posts
  as they exist in the canonical tables. Used to detect drift between
  what we've ingested vs what was promoted (corrigendum detection in
  PR5).

Hashes are sha256 over a normalised JSON snapshot, NOT over raw HTML /
PDF bytes / CSS / ads / CDN wrappers. Two scrapes of the same page that
differ only in markup or ad placement must produce the same hash.

Normalisation rules:

* Strings: lowercased + whitespace-collapsed.
* Dates: coerced to ``YYYY-MM-DD``. Unparseable strings keep their raw
  (lowercased, trimmed) form so hash equality is still defined.
* URLs: lowercased + trimmed; trailing slash stripped.
* Arrays of strings: deduplicated, lowercased, sorted.
* ``None`` / empty values are stripped consistently before hashing so an
  "absent" field equals an "empty string" field equals a "null" field.
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import date, datetime
from typing import Any, Iterable


# Fields we hash from the source/extracted payload.
_SOURCE_FIELDS: tuple[str, ...] = (
    "title",
    "organization_name",
    "notification_number",
    "apply_start_date",
    "apply_end_date",
    "total_vacancies",
    "post_names",                     # synthesised from posts[].post_name
    "official_notification_url",
    "official_apply_url",
    "source_pdf_url",
)


_WHITESPACE_RE = re.compile(r"\s+")


def _norm_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (int, float, bool)):
        value = str(value)
    if not isinstance(value, str):
        return None
    cleaned = _WHITESPACE_RE.sub(" ", value).strip().lower()
    return cleaned or None


def _norm_url(value: Any) -> str | None:
    txt = _norm_text(value)
    if not txt:
        return None
    # Strip trailing slashes so https://x.gov.in/notif/ and
    # https://x.gov.in/notif hash the same.
    while txt.endswith("/"):
        txt = txt[:-1]
    return txt or None


def _norm_date(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if not isinstance(value, str):
        return None
    raw = value.strip()
    if not raw:
        return None
    # ISO ``YYYY-MM-DD`` is the canonical wire format used by the queue
    # payload; try it first, then a small set of common Indian formats.
    iso_match = re.match(r"^(\d{4})-(\d{2})-(\d{2})", raw)
    if iso_match:
        return f"{iso_match.group(1)}-{iso_match.group(2)}-{iso_match.group(3)}"
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    # Unparseable: keep lowercased trimmed form. Two identical-but-weird
    # strings still hash the same.
    return raw.lower()


def _norm_int(value: Any) -> int | None:
    if value is None or isinstance(value, bool):
        # bool is a subclass of int; explicit None.
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else None
    if isinstance(value, str):
        cleaned = re.sub(r"[,\s]", "", value)
        if not cleaned:
            return None
        try:
            return int(cleaned)
        except ValueError:
            return None
    return None


def _norm_str_array(values: Any) -> list[str]:
    if not isinstance(values, Iterable) or isinstance(values, (str, bytes)):
        return []
    out: set[str] = set()
    for v in values:
        n = _norm_text(v)
        if n:
            out.add(n)
    return sorted(out)


def _extract_post_names(extracted: dict[str, Any]) -> list[str]:
    posts = extracted.get("posts")
    if not isinstance(posts, list):
        return []
    names: list[str] = []
    for p in posts:
        if isinstance(p, dict):
            names.append(p.get("post_name"))
    return _norm_str_array(names)


def normalize_verification_snapshot(extracted_data: dict[str, Any]) -> dict[str, Any]:
    """Return a deterministic, normalised view of ``extracted_data``.

    The returned dict has only the hash-relevant fields. Empty / None
    values are dropped so the JSON encoding is stable.
    """
    if not isinstance(extracted_data, dict):
        raise TypeError("extracted_data must be a dict")

    snapshot: dict[str, Any] = {
        "title":                    _norm_text(extracted_data.get("title") or extracted_data.get("name")),
        "organization_name":        _norm_text(extracted_data.get("organization_name")),
        "notification_number":      _norm_text(extracted_data.get("notification_number")),
        "apply_start_date":         _norm_date(extracted_data.get("apply_start_date")),
        "apply_end_date":           _norm_date(extracted_data.get("apply_end_date")),
        "total_vacancies":          _norm_int(extracted_data.get("total_vacancies")),
        "post_names":               _extract_post_names(extracted_data),
        "official_notification_url": _norm_url(extracted_data.get("official_notification_url")),
        "official_apply_url":       _norm_url(extracted_data.get("official_apply_url")),
        "source_pdf_url":           _norm_url(
            extracted_data.get("source_pdf_url")
            or extracted_data.get("pdf_url")
            or extracted_data.get("notification_pdf_url")
        ),
    }
    # Drop None / [] so absent==null==[] when JSON-encoded.
    return {k: v for k, v in snapshot.items() if v not in (None, [], "")}


def _sha256_json(snapshot: dict[str, Any]) -> str:
    encoded = json.dumps(snapshot, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def build_source_snapshot_hash(extracted_data: dict[str, Any]) -> str:
    """sha256 over the normalised extracted-data snapshot."""
    snap = normalize_verification_snapshot(extracted_data)
    return _sha256_json(snap)


def build_canonical_snapshot_hash(
    recruitment: dict[str, Any],
    posts: list[dict[str, Any]],
) -> str:
    """sha256 over the canonical recruitment + posts.

    ``posts`` is required (no default). A recruitment-only hash is
    explicitly rejected — a "recruitment with no posts" is never the
    canonical state we want to compare against, and silently allowing
    the empty case in PR1 makes corrigendum detection in PR5 unreliable.
    """
    if not isinstance(recruitment, dict):
        raise TypeError("recruitment must be a dict")
    if not isinstance(posts, list):
        raise TypeError("posts must be a list")

    # Synthesize the same flat shape as ``normalize_verification_snapshot``.
    payload: dict[str, Any] = {
        "title":                    _norm_text(recruitment.get("name") or recruitment.get("title")),
        "organization_name":        _norm_text(recruitment.get("organization_name")),
        "notification_number":      _norm_text(recruitment.get("notification_number")),
        "apply_start_date":         _norm_date(recruitment.get("apply_start_date")),
        "apply_end_date":           _norm_date(recruitment.get("apply_end_date")),
        "total_vacancies":          _norm_int(recruitment.get("total_vacancies")),
        "post_names":               _norm_str_array(p.get("post_name") for p in posts if isinstance(p, dict)),
        "official_notification_url": _norm_url(recruitment.get("official_notification_url")),
        "official_apply_url":       _norm_url(recruitment.get("official_apply_url")),
        "source_pdf_url":           _norm_url(recruitment.get("source_pdf_url")),
    }
    snap = {k: v for k, v in payload.items() if v not in (None, [], "")}
    return _sha256_json(snap)


__all__ = [
    "normalize_verification_snapshot",
    "build_source_snapshot_hash",
    "build_canonical_snapshot_hash",
]
