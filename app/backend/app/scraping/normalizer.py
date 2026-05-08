from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .schemas import ExtractedRecruitment


@dataclass
class NormalizedRecruitment:
    normalized_fields: dict[str, Any]
    data_quality_score: float
    warnings: list[str]


def normalize_recruitment(extracted: ExtractedRecruitment) -> NormalizedRecruitment:
    warnings: list[str] = []
    score = 1.0
    if not extracted.title:
        warnings.append("missing_title")
        score -= 0.25
    if not extracted.organization_name:
        warnings.append("missing_organization")
        score -= 0.25
    if not extracted.apply_end_date:
        warnings.append("missing_apply_end_date")
        score -= 0.15
    if not extracted.posts:
        warnings.append("missing_posts")
        score -= 0.2
    if extracted.total_vacancies is None:
        warnings.append("missing_total_vacancies")
        score -= 0.15

    normalized = {
        "title": extracted.title.strip(),
        "organization_name": extracted.organization_name.strip(),
        "org_type": extracted.org_type,
        "has_posts": bool(extracted.posts),
    }
    return NormalizedRecruitment(normalized_fields=normalized, data_quality_score=max(0.0, round(score, 2)), warnings=warnings)
