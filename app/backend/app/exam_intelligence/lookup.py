"""Exam / topic resolvers (defensive)."""
from __future__ import annotations

import logging
from typing import Any, Callable

logger = logging.getLogger("career_copilot.exam_intelligence.lookup")


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("exam_intelligence read failed: %s", exc)
        return default


_EXAM_COLS = (
    "id, slug, name, exam_type, default_difficulty_level, "
    "exam_family_id, is_active"
)


def resolve_exam_by_slug(supabase: Any, slug: str) -> dict[str, Any] | None:
    if not slug:
        return None
    rows = _safe(
        lambda: (
            supabase.table("exams")
            .select(_EXAM_COLS)
            .eq("slug", slug)
            .limit(1)
            .execute()
            .data
        ),
        default=[],
    ) or []
    return rows[0] if rows else None


def resolve_exam_by_id(supabase: Any, exam_id: str) -> dict[str, Any] | None:
    if not exam_id:
        return None
    rows = _safe(
        lambda: (
            supabase.table("exams")
            .select(_EXAM_COLS)
            .eq("id", exam_id)
            .limit(1)
            .execute()
            .data
        ),
        default=[],
    ) or []
    return rows[0] if rows else None


def list_active_exams(supabase: Any, limit: int = 100) -> list[dict[str, Any]]:
    rows = _safe(
        lambda: (
            supabase.table("exams")
            .select(_EXAM_COLS)
            .eq("is_active", True)
            .order("name")
            .limit(limit)
            .execute()
            .data
        ),
        default=[],
    ) or []
    return list(rows)
