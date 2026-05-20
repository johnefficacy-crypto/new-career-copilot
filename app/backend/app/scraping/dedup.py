"""Duplicate detection for scraped recruitment notifications.

Returns a structured ``DuplicateDecision`` rather than a boolean so the runner
can persist the canonical recruitment id, the queue-row id, and the reason for
the match. Title-only similarity is no longer sufficient — duplicates also
require organization + year agreement, or an exact URL match.

────────────────────────────────────────────────────────────────────────
TARGETED DEDUP POLICY (no full-table scans)
────────────────────────────────────────────────────────────────────────
Neither ``recruitments`` nor ``scrape_queue`` has a ``canonical_key``
column, so dedup keys on ``notification_number``, ``(organization_id,
year)``, and the exact ``source_url``. Every query is bounded by a
``.limit()``; when no usable key exists we queue ``needs_review`` rather
than scan the whole table.

PRE-LLM (``pre_llm_dedup_check``): coarse-fetch recruitments whose
official URL equals the raw scrape target URL (``.or_`` on both URL
columns, ``.limit(20)``), then confirm with normalised comparison in
Python. A hit short-circuits the Anthropic call. Listing-page URLs miss
here on purpose; post-extraction catches them.

POST-EXTRACTION (``post_extraction_dedup_recruitments`` / ``_queue``),
first match wins:
  A. canonical_key valid + notification_number present →
       ``.eq(notification_number).limit(10)``; compare canonical_key.
       match → duplicate; notif matched but key disagrees → needs_review.
  B. notification_number present, canonical_key invalid →
       ``.eq(notification_number).limit(10)``; any match → duplicate
       (notification numbers are globally unique by construction).
  C. organization_name → organization_id resolves AND year present →
       ``.eq(organization_id).eq(year).limit(20)``; canonical_key
       decisive. No fuzzy org matching — exact-name resolve or fall
       through to (D).
  D. only canonical_key valid → no query, needs_review.
  E. everything missing/invalid → no query, needs_review.

Match handling: 1 → duplicate; 2+ → needs_review (+candidate_ids);
0 → unique. **Scenario-2 policy (notif match + canonical_key mismatch) =
needs_review**, never silent merge (a divergent canonical key means
org/year/title disagree — investigate).

scrape_queue dedup: same A–E, ALWAYS ``.not_.in_(status,
['rejected','duplicate'])``, NEVER constrained by source_id
(cross-source dupes are the target). Stage-1 pre-filter selects only
``id, status`` (no ``extracted_data``); if ≤10 candidates, stage-2
re-fetches them by ``id`` with ``extracted_data`` to compare canonical_key.

False-positive policy: when in doubt → needs_review. False-negative
policy: accept missed dupes when keys are missing/invalid; never
full-scan as a fallback.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Any

from app.scraping._url_normalize import normalize_url as _normalize_url_strict
from app.scraping.extractor import canonical_key_invalid, recruitment_key


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


# ════════════════════════════════════════════════════════════════════════
#  Targeted dedup (Tasks 3/4) — see the module docstring for the policy.
# ════════════════════════════════════════════════════════════════════════

_REC_DEDUP_SELECT = (
    "id, name, year, organizations(name), official_notification_url, "
    "official_apply_url, notification_number"
)
_DEDUP_NOTIF_MIN_LEN = 4
_PRE_LLM_LIMIT = 20
_NOTIF_LIMIT = 10
_ORG_YEAR_LIMIT = 20


@dataclass
class DedupResult:
    status: str  # "unique" | "duplicate" | "needs_review"
    duplicate_of: str | None = None
    candidate_ids: list[str] = field(default_factory=list)
    reason: str = ""


def _data(res: Any) -> list[dict[str, Any]]:
    return list(getattr(res, "data", None) or [])


def _rec_org_name(r: dict[str, Any]) -> str | None:
    org = r.get("organizations")
    if isinstance(org, list):
        org = org[0] if org else None
    if isinstance(org, dict):
        return org.get("name")
    return r.get("organization_name")


def _rec_canonical_key(r: dict[str, Any]) -> str:
    return recruitment_key(_rec_org_name(r), r.get("year"), r.get("name"))


def _resolve_organization_id(sb: Any, org_name: str | None) -> str | None:
    """Exact-name organization resolve (limit 1). No fuzzy matching —
    a miss falls through to needs_review per policy."""
    if not org_name:
        return None
    rows = _data(
        sb.table("organizations").select("id").eq("name", org_name).limit(1).execute()
    )
    return rows[0].get("id") if rows else None


def pre_llm_dedup_check(sb: Any, scrape_target_url: str | None) -> DedupResult:
    """Skip the Anthropic call when a recruitment already carries this exact
    URL. Coarse ``.or_`` fetch (bounded), confirmed by normalised compare."""
    key = _normalize_url_strict(scrape_target_url)
    if not key:
        return DedupResult("unique", reason="no_url")
    res = (
        sb.table("recruitments")
        .select("id, official_notification_url, official_apply_url")
        .or_(
            f"official_notification_url.eq.{scrape_target_url},"
            f"official_apply_url.eq.{scrape_target_url}"
        )
        .limit(_PRE_LLM_LIMIT)
        .execute()
    )
    for r in _data(res):
        cands = {
            _normalize_url_strict(r.get("official_notification_url")),
            _normalize_url_strict(r.get("official_apply_url")),
        } - {""}
        if key in cands:
            return DedupResult("duplicate", duplicate_of=r.get("id"), reason="exact_url_duplicate")
    return DedupResult("unique", reason="no_url_match")


def _decide_from_canonical(
    rows: list[dict[str, Any]], sim_key: str, *, reason_prefix: str
) -> DedupResult:
    """Compare canonical_key across ``rows``. 1 match → duplicate, 2+ →
    needs_review, notif/org rows present but none match → needs_review,
    nothing → unique."""
    matches = [r for r in rows if _rec_canonical_key(r) == sim_key]
    if len(matches) == 1:
        return DedupResult("duplicate", duplicate_of=matches[0].get("id"), reason=f"{reason_prefix}_key_match")
    if len(matches) >= 2:
        return DedupResult(
            "needs_review",
            candidate_ids=[m.get("id") for m in matches],
            reason=f"{reason_prefix}_multi_match",
        )
    return DedupResult("unique", reason=f"{reason_prefix}_no_key_match")


def post_extraction_dedup_recruitments(sb: Any, extracted: dict[str, Any], sim_key: str) -> DedupResult:
    notif = extracted.get("notification_number")
    norm_notif = _norm(notif)
    year = extracted.get("year")
    org_name = extracted.get("organization_name")
    key_invalid = canonical_key_invalid(sim_key)

    # Path A / B — notification_number present.
    if len(norm_notif) >= _DEDUP_NOTIF_MIN_LEN:
        rows = _data(
            sb.table("recruitments").select(_REC_DEDUP_SELECT)
            .eq("notification_number", notif).limit(_NOTIF_LIMIT).execute()
        )
        if key_invalid:
            # Path B — notif numbers are globally unique → any match is a dup.
            if len(rows) == 1:
                return DedupResult("duplicate", duplicate_of=rows[0].get("id"), reason="notif_only")
            if len(rows) >= 2:
                return DedupResult("needs_review", candidate_ids=[r.get("id") for r in rows], reason="notif_multi")
            return DedupResult("unique", reason="notif_no_match")
        # Path A — canonical_key must agree.
        decided = _decide_from_canonical(rows, sim_key, reason_prefix="notif")
        if decided.status == "unique" and rows:
            # notif matched but canonical_key disagreed → investigate.
            return DedupResult("needs_review", candidate_ids=[r.get("id") for r in rows], reason="notif_match_key_mismatch")
        return decided

    # Path C — organization_id + year.
    if org_name and year:
        org_id = _resolve_organization_id(sb, org_name)
        if org_id:
            rows = _data(
                sb.table("recruitments").select(_REC_DEDUP_SELECT)
                .eq("organization_id", org_id).eq("year", year).limit(_ORG_YEAR_LIMIT).execute()
            )
            return _decide_from_canonical(rows, sim_key, reason_prefix="org_year")
        # org resolve failed → fall through to D/E (no fuzzy matching).

    # Path D / E — no usable key.
    return DedupResult("needs_review", reason="dedup_key_unavailable")


def post_extraction_dedup_queue(sb: Any, extracted: dict[str, Any], sim_key: str) -> DedupResult:
    """Open-queue dedup. Stage-1 narrows by an indexed key WITHOUT pulling
    extracted_data; stage-2 re-fetches the narrow set by id to compare
    canonical_key. Cross-source by design (no source_id filter)."""
    notif = extracted.get("notification_number")
    norm_notif = _norm(notif)
    year = extracted.get("year")
    key_invalid = canonical_key_invalid(sim_key)

    def _stage1(filter_col: str, filter_val: Any) -> list[dict[str, Any]]:
        return _data(
            sb.table("scrape_queue").select("id, status")
            # dry_run rows are excluded too (migration 122 isolation).
            .not_.in_("status", ["rejected", "duplicate", "dry_run"])
            .eq(filter_col, filter_val).limit(_NOTIF_LIMIT).execute()
        )

    def _stage2(ids: list[str]) -> list[dict[str, Any]]:
        if not ids:
            return []
        return _data(
            sb.table("scrape_queue").select("id, extracted_data")
            .in_("id", ids).limit(_NOTIF_LIMIT).execute()
        )

    # Path A / B — notification_number present.
    if len(norm_notif) >= _DEDUP_NOTIF_MIN_LEN:
        pre = _stage1("extracted_data->>notification_number", notif)
        ids = [r.get("id") for r in pre if r.get("id")]
        if key_invalid:
            if len(ids) == 1:
                return DedupResult("duplicate", duplicate_of=ids[0], reason="queue_notif_only")
            if len(ids) >= 2:
                return DedupResult("needs_review", candidate_ids=ids, reason="queue_notif_multi")
            return DedupResult("unique", reason="queue_notif_no_match")
        full = _stage2(ids)
        return _decide_queue_from_canonical(full, sim_key, reason_prefix="queue_notif", had_prefilter=bool(ids))

    # Path C — year (queue rows carry no organization_id).
    if year:
        pre = _stage1("extracted_data->>year", str(year))
        ids = [r.get("id") for r in pre if r.get("id")]
        full = _stage2(ids)
        return _decide_queue_from_canonical(full, sim_key, reason_prefix="queue_year", had_prefilter=False)

    return DedupResult("needs_review", reason="dedup_key_unavailable")


def _queue_canonical_key(row: dict[str, Any]) -> str | None:
    d = row.get("extracted_data")
    if not isinstance(d, dict):
        return None
    return recruitment_key(d.get("organization_name"), d.get("year"), d.get("title"))


def _decide_queue_from_canonical(
    rows: list[dict[str, Any]], sim_key: str, *, reason_prefix: str, had_prefilter: bool
) -> DedupResult:
    matches = [r for r in rows if _queue_canonical_key(r) == sim_key]
    if len(matches) == 1:
        return DedupResult("duplicate", duplicate_of=matches[0].get("id"), reason=f"{reason_prefix}_key_match")
    if len(matches) >= 2:
        return DedupResult("needs_review", candidate_ids=[m.get("id") for m in matches], reason=f"{reason_prefix}_multi")
    if had_prefilter and rows:
        # key prefiltered but canonical disagreed → investigate.
        return DedupResult("needs_review", candidate_ids=[r.get("id") for r in rows], reason=f"{reason_prefix}_key_mismatch")
    return DedupResult("unique", reason=f"{reason_prefix}_no_key_match")
