"""Exam / topic resolvers (defensive).

Reads from ``exams`` are admin-mutable but change rarely. We hold a
10-minute in-process TTL cache so dashboard fan-out doesn't repeat the
same one-row lookup across every request. Admin writers must call
:func:`invalidate_exam_lookup_cache` after they mutate the table.
"""
from __future__ import annotations

import logging
from typing import Any, Callable

from cachetools import TTLCache

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

# 10-minute TTL across all three lookup functions. Keys are tagged with
# a short prefix so a single cache holds slug, id, and list lookups.
_EXAM_CACHE: TTLCache = TTLCache(maxsize=512, ttl=600)


def invalidate_exam_lookup_cache() -> None:
    """Drop the in-process exam-lookup cache.

    Call this from admin write paths after an ``exams`` row is created,
    edited, or soft-deleted so the next dashboard read picks up the
    change immediately.
    """
    _EXAM_CACHE.clear()


def resolve_exam_by_slug(supabase: Any, slug: str) -> dict[str, Any] | None:
    if not slug:
        return None
    key = ("slug", slug)
    cached = _EXAM_CACHE.get(key)
    if cached is not None:
        return None if cached == _MISSING else cached
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
    value = rows[0] if rows else _MISSING
    _EXAM_CACHE[key] = value
    return None if value is _MISSING else value


def resolve_exam_by_id(supabase: Any, exam_id: str) -> dict[str, Any] | None:
    if not exam_id:
        return None
    key = ("id", exam_id)
    cached = _EXAM_CACHE.get(key)
    if cached is not None:
        return None if cached == _MISSING else cached
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
    value = rows[0] if rows else _MISSING
    _EXAM_CACHE[key] = value
    return None if value is _MISSING else value


def list_active_exams(supabase: Any, limit: int = 100) -> list[dict[str, Any]]:
    key = ("active", limit)
    cached = _EXAM_CACHE.get(key)
    if cached is not None:
        return list(cached)
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
    rows = list(rows)
    _EXAM_CACHE[key] = rows
    return list(rows)


# Sentinel for negative-cache so a 404 lookup doesn't keep re-hitting
# Supabase within the TTL window. Use a module-private object so it can
# never collide with a real row dict.
_MISSING: dict[str, Any] = {"__missing__": True}
