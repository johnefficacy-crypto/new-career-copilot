"""Pydantic shapes for the scraper. Mirrors ``types/scraping.ts``."""
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
    education_required: str | None = None
    disciplines: list[str] | None = None


class ExtractedRecruitment(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str
    organization_name: str
    org_type: str
    notification_date: str | None = None
    apply_start_date: str | None = None
    apply_end_date: str | None = None
    total_vacancies: int | None = None
    year: int
    official_notification_url: str
    source_pdf_url: str | None = None
    posts: list[ExtractedPost] = Field(default_factory=list)


def to_json_safe(data: ExtractedRecruitment) -> dict[str, Any]:
    """Return a Json-serialisable dict for ``scrape_queue.extracted_data``."""
    return data.model_dump()
