"""Duplicate detection for scraped recruitment notifications.

Returns a structured ``DuplicateDecision`` rather than a boolean so the runner
can persist the canonical recruitment id, the queue-row id, and the reason for
the match. Title-only similarity is no longer sufficient — duplicates also
require organization + year agreement, or an exact URL match.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Any


@dataclass
class DuplicateDecision:
    is_duplicate: bool = False
    score: int = 0
    reason: str | None = None
    duplicate_recruitment_id: str | None = None
    duplicate_queue_id: str | None = None
    matched_fields: list[str] = field(default_factory=list)


def _norm(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", "", (value or "").lower())


def normalize_url(value: str | None) -> str:
    """Public URL normaliser shared with the runner's pre-LLM dedup path.

    Lowercases, strips whitespace, drops the query string, and strips
    trailing slashes — enough to match "same notice, different
    capitalisation / tracking params". Stricter than a full URL parse,
    deliberately: tracking params are noise for identity here.
    """
    raw = (value or "").strip().lower()
    return raw.split("?", 1)[0].rstrip("/")


# Back-compat private alias — existing callers in this module use the
# underscore form. New callers should import ``normalize_url``.
_norm_url = normalize_url


def _title_ratio(a: str, b: str) -> float:
    aa = (a or "").strip().lower()
    bb = (b or "").strip().lower()
    if not aa or not bb:
        return 0.0
    return SequenceMatcher(None, aa, bb).ratio()


def find_duplicate(
    extracted: dict[str, Any],
    *,
    sim_key: str,
    existing_recruitments: list[dict[str, Any]],
    queued: dict[str, str] | None = None,
    title_threshold: float = 0.85,
) -> DuplicateDecision:
    """Decide whether ``extracted`` duplicates anything known.

    Signals (first match wins, highest-trust first):
      1. Exact ``official_notification_url`` / ``official_apply_url`` match.
      2. Same (org_norm, notification_number) against canonical recruitments.
      3. Same similarity key against canonical recruitments.
      4. Same similarity key against an open queue row.
      5. (org_norm, year, title fuzzy ≥ threshold) against canonical recruitments.

    Title alone never decides — that was the old behaviour and it false-matched
    across organisations and years.
    """
    queued = queued or {}

    extracted_urls = {
        _norm_url(extracted.get("official_notification_url")),
        _norm_url(extracted.get("official_apply_url")),
    } - {""}

    extracted_org = _norm(extracted.get("organization_name"))
    extracted_year = extracted.get("year")
    extracted_title = extracted.get("title") or ""
    # Advertisement / notification number, normalised. Org-scoped because
    # numbers like "05/2026" repeat across organisations — only an
    # (org, number) pair is trustworthy as an exact key.
    extracted_notif_no = _norm(extracted.get("notification_number"))

    for r in existing_recruitments:
        rec_urls = {
            _norm_url(r.get("official_notification_url")),
            _norm_url(r.get("official_apply_url")),
        } - {""}
        if extracted_urls & rec_urls:
            return DuplicateDecision(
                is_duplicate=True,
                score=100,
                reason="official_url_exact",
                duplicate_recruitment_id=r.get("id"),
                matched_fields=["official_url"],
            )

    # (org, notification_number) exact match — second only to a URL match.
    # Requires a non-trivial number so a stray "" / "1" can't collide.
    if extracted_org and len(extracted_notif_no) >= 4:
        for r in existing_recruitments:
            org = r.get("organizations")
            if isinstance(org, list):
                org = org[0] if org else None
            rec_org = _norm((org or {}).get("name")) if isinstance(org, dict) else _norm(r.get("organization_name"))
            if rec_org and rec_org == extracted_org and _norm(r.get("notification_number")) == extracted_notif_no:
                return DuplicateDecision(
                    is_duplicate=True,
                    score=99,
                    reason="notification_number_exact",
                    duplicate_recruitment_id=r.get("id"),
                    matched_fields=["organization_name", "notification_number"],
                )

    for r in existing_recruitments:
        org = r.get("organizations")
        if isinstance(org, list):
            org = org[0] if org else None
        rec_org = _norm((org or {}).get("name"))
        rec_key = f"{rec_org}-{r.get('year') or 0}-{_norm(r.get('name'))[:30]}"
        if rec_key == sim_key:
            return DuplicateDecision(
                is_duplicate=True,
                score=95,
                reason="similarity_key",
                duplicate_recruitment_id=r.get("id"),
                matched_fields=["organization_name", "year", "title"],
            )

    if sim_key in queued:
        return DuplicateDecision(
            is_duplicate=True,
            score=90,
            reason="similarity_key_queued",
            duplicate_queue_id=queued[sim_key],
            matched_fields=["organization_name", "year", "title"],
        )

    if extracted_org and extracted_year:
        for r in existing_recruitments:
            org = r.get("organizations")
            if isinstance(org, list):
                org = org[0] if org else None
            rec_org = _norm((org or {}).get("name"))
            if rec_org != extracted_org:
                continue
            if (r.get("year") or 0) != extracted_year:
                continue
            ratio = _title_ratio(extracted_title, r.get("name") or "")
            if ratio >= title_threshold:
                return DuplicateDecision(
                    is_duplicate=True,
                    score=int(ratio * 85),
                    reason="fuzzy_title_with_org_year",
                    duplicate_recruitment_id=r.get("id"),
                    matched_fields=["organization_name", "year", "title_fuzzy"],
                )

    return DuplicateDecision(is_duplicate=False, score=0)


def fuzzy_duplicate(title_a: str, title_b: str, *, threshold: float = 0.85) -> bool:
    """Deprecated. Kept for tests / external callers — use ``find_duplicate``.

    Substring containment is no longer enough on its own; this now requires a
    SequenceMatcher ratio over ``threshold``. Callers in the runner have moved
    to ``find_duplicate``.
    """
    a = (title_a or "").strip().lower()
    b = (title_b or "").strip().lower()
    if not a or not b:
        return False
    return SequenceMatcher(None, a, b).ratio() >= threshold
