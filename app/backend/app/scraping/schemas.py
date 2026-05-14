"""Pydantic shapes for the scraper. Mirrors ``types/scraping.ts``.

The original ``ExtractedRecruitment`` doubled as both the "permissive shape
written into ``scrape_queue.extracted_data`` for admin review" and the
"strict shape promoted into canonical tables". Promotion needs hard
guarantees (apply_end_date set, at least one post, etc.); admin queue
review needs to accept partial extractions so an editor can fill gaps.

PR 3 splits the two:

* :class:`RawExtractedRecruitment` is the queue/admin shape. Most fields
  are optional, post-level eligibility fields are also optional.
  ``ExtractedRecruitment`` is kept as a backward-compat alias.
* :class:`VerifiedRecruitmentForPromotion` is the strict shape pydantic
  enforces at promotion time: ``apply_end_date`` and
  ``official_notification_url`` must be set, and at least one post is
  required.

``ExtractedPost`` also gains the eligibility fields that downstream
canonical tables already model (``age_cutoff_date``,
``raw_requirement_text``, fees, selection process, category-wise
vacancies, exam pattern, skill tests, certificates, job location, and a
free-form ``source_evidence`` blob) so admin review and promotion can
both make use of them without the queue having to relearn them per row.
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ExtractedPost(BaseModel):
    model_config = ConfigDict(extra="ignore")

    post_name: str
    group_type: str | None = None
    pay_level: str | None = None
    vacancies: int | None = None
    min_age: int | None = None
    max_age: int | None = None
    age_cutoff_date: str | None = None
    education_required: str | None = None
    raw_requirement_text: str | None = None
    disciplines: list[str] | None = None

    # Unit (organisation slice) — already used by the runner's
    # recruitment_units insert path.
    unit_code: str | None = None
    unit_name: str | None = None
    unit_location_state: str | None = None
    unit_location_city: str | None = None

    language_requirements: list[str] | None = None

    # Richer eligibility fields. Downstream canonical tables model most of
    # these; the runner doesn't have to consume every one in this PR but
    # the queue payload now carries them so reviewers and follow-up PRs can.
    fees: dict[str, Any] | None = None
    selection_process: list[str] | None = None
    category_vacancies: dict[str, int] | None = None
    age_relaxation: dict[str, Any] | None = None
    exam_pattern: list[dict[str, Any]] | None = None
    skill_tests: list[dict[str, Any]] | None = None
    certificates: list[str] | None = None
    job_location: str | None = None
    source_evidence: dict[str, Any] | None = None

    # True iff the notification states candidates must be a domicile of the
    # recruiting state (or equivalent — e.g. "only Maharashtra domiciles
    # may apply"). null means the extractor saw no explicit statement; the
    # runner treats null and false the same way (no domicile enforcement).
    # High-risk field — must be admin-verified via the promotion gate before
    # canonical write. See `app.scraping.promotion_gate.HIGH_RISK_FIELDS`.
    requires_domicile: bool | None = None


class RawExtractedRecruitment(BaseModel):
    """Permissive queue/admin-review shape.

    *Every* field is optional — a partial extraction (the AI couldn't
    find the title, or only a listing fragment was scraped) must still
    land in ``scrape_queue`` so an admin can fill the gaps. The previous
    version required title / organization_name / org_type / year /
    official_notification_url, so those partials raised a ValidationError
    in the extractor and never reached the review queue at all — exactly
    the opposite of "permissive". Use
    :class:`VerifiedRecruitmentForPromotion` for canonical writes.
    """
    model_config = ConfigDict(extra="ignore")

    title: str | None = None
    organization_name: str | None = None
    org_type: str | None = None
    # Advertisement / notification number as printed on the notice
    # (e.g. "Advt. No. 05/2026"). High-trust dedup signal — combined
    # with the organisation it is effectively a unique key.
    notification_number: str | None = None
    notification_date: str | None = None
    apply_start_date: str | None = None
    apply_end_date: str | None = None
    total_vacancies: int | None = None
    year: int | None = None
    official_notification_url: str | None = None
    official_apply_url: str | None = None
    source_pdf_url: str | None = None
    posts: list[ExtractedPost] = Field(default_factory=list)


# Back-compat alias: existing callers (runner, admin, tests) still import
# ``ExtractedRecruitment``. The shape is identical to RawExtractedRecruitment.
ExtractedRecruitment = RawExtractedRecruitment


class VerifiedRecruitmentForPromotion(RawExtractedRecruitment):
    """Strict shape required for canonical promotion.

    Pydantic re-tightens every field the canonical schema needs:
    ``title`` / ``organization_name`` / ``org_type`` / ``year`` /
    ``official_notification_url`` / ``apply_end_date`` must be set, and
    at least one post is required. Admin and runner promotion code
    constructs this from the queue payload so promotion fails fast (with
    a clear error) instead of writing a partial recruitment.
    """
    title: str
    organization_name: str
    org_type: str
    year: int
    official_notification_url: str
    apply_end_date: str
    posts: list[ExtractedPost] = Field(min_length=1)


def to_json_safe(data: RawExtractedRecruitment) -> dict[str, Any]:
    """Return a JSON-serialisable dict for ``scrape_queue.extracted_data``."""
    return data.model_dump()
