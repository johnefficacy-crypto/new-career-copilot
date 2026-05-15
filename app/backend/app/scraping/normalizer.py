"""Quality/normalisation pass for queue payloads.

Phase 6 of the scraping audit expanded this from a thin missing-field
scorer into a post-level readiness scorer plus a set of contradiction
validators. The score still drives admin sort order; warnings document
every signal so reviewers see exactly what's wrong.

Whitespace-only ``title`` / ``organization_name`` are treated as missing
because the previous truthy check let "   " slip through and normalize
to an empty string downstream.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

from .schemas import ExtractedRecruitment


@dataclass
class NormalizedRecruitment:
    normalized_fields: dict[str, Any]
    data_quality_score: float
    warnings: list[str]


# Fields counted toward post-level readiness. Each post that supplies all
# four contributes a full +0.1 bonus; partial coverage contributes a
# fraction. The cap below limits the total post bonus so a recruitment
# with many incomplete posts can't out-score one well-described post.
_POST_ELIGIBILITY_FIELDS = ("min_age", "max_age", "education_required", "vacancies")
_MAX_POST_BONUS = 0.2


def _is_blank(value: Any) -> bool:
    """A truly missing field. Whitespace counts as missing."""
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    return False


def _parse_iso_date(raw: str | None) -> date | None:
    if not raw:
        return None
    try:
        return date.fromisoformat(raw[:10])
    except Exception:
        return None


def _post_coverage(post: Any) -> float:
    present = sum(
        1 for field in _POST_ELIGIBILITY_FIELDS
        if not _is_blank(getattr(post, field, None))
    )
    return present / len(_POST_ELIGIBILITY_FIELDS)


def _post_value(post: Any, name: str) -> Any:
    return getattr(post, name, None)


def normalize_recruitment(extracted: ExtractedRecruitment) -> NormalizedRecruitment:
    warnings: list[str] = []
    score = 1.0

    if _is_blank(extracted.title):
        warnings.append("missing_title")
        score -= 0.25
    if _is_blank(extracted.organization_name):
        warnings.append("missing_organization")
        score -= 0.25
    if _is_blank(extracted.apply_end_date):
        warnings.append("missing_apply_end_date")
        score -= 0.15
    if not extracted.posts:
        warnings.append("missing_posts")
        score -= 0.2
    if extracted.total_vacancies is None:
        warnings.append("missing_total_vacancies")
        score -= 0.15

    # ── Post-level eligibility readiness ───────────────────────────────
    if extracted.posts:
        coverages = [_post_coverage(p) for p in extracted.posts]
        avg = sum(coverages) / len(coverages)
        score += _MAX_POST_BONUS * avg
        # Flag posts that are missing both age and education — those are
        # the two eligibility signals admins must fix before promotion.
        weak = [
            i for i, p in enumerate(extracted.posts)
            if _is_blank(_post_value(p, "min_age"))
            and _is_blank(_post_value(p, "max_age"))
            and _is_blank(_post_value(p, "education_required"))
        ]
        if weak:
            warnings.append(f"posts_missing_eligibility:{','.join(str(i) for i in weak)}")

    # ── Contradiction validators (warnings only) ──────────────────────
    start = _parse_iso_date(extracted.apply_start_date)
    end = _parse_iso_date(extracted.apply_end_date)
    notification = _parse_iso_date(extracted.notification_date)
    if start and end and end < start:
        warnings.append("date_order_invalid")
    if notification and end and notification > end:
        warnings.append("notification_after_apply_end")

    if extracted.year and (start or end or notification):
        if not any(d and d.year == extracted.year for d in (start, end, notification)):
            warnings.append("year_date_mismatch")

    if extracted.posts:
        vac_sum = 0
        any_vac = False
        for p in extracted.posts:
            v = _post_value(p, "vacancies")
            if isinstance(v, int):
                vac_sum += v
                any_vac = True
            mn, mx = _post_value(p, "min_age"), _post_value(p, "max_age")
            if isinstance(mn, int) and isinstance(mx, int) and mn > mx:
                warnings.append("age_range_invalid")
                break
        if (
            any_vac
            and isinstance(extracted.total_vacancies, int)
            and vac_sum > extracted.total_vacancies
        ):
            warnings.append("vacancy_sum_mismatch")

    normalized = {
        "title": (extracted.title or "").strip(),
        "organization_name": (extracted.organization_name or "").strip(),
        "org_type": extracted.org_type,
        "has_posts": bool(extracted.posts),
    }
    # Clamp to [0.0, 1.0]. The post-readiness bonus could otherwise push
    # the score above 1.0, which the admin UI rendered as "120%".
    clamped = max(0.0, min(1.0, score))
    return NormalizedRecruitment(
        normalized_fields=normalized,
        data_quality_score=round(clamped, 2),
        warnings=warnings,
    )
