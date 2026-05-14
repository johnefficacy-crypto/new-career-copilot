"""User Study OS plan preferences — read / write + weighting profiles.

One row per user in ``user_study_plan_preferences``. This is the user's
autonomy surface over the deterministic planner: the weighting ``focus``,
plan-shape overrides (``max_tasks_per_day`` / ``preferred_task_size``),
explicit ``pinned`` / ``muted`` topics, and an ``auto_regenerate`` opt-out.

Every read is defensive — a missing row simply yields the defaults, so
the planner always has a usable preference object.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Callable

logger = logging.getLogger("career_copilot.study_os.plan_preferences")

_VALID_FOCUS = {"balanced", "weak_areas", "exam_priority", "high_yield"}
_VALID_SIZE = {"small", "medium", "large"}

DEFAULT_PREFERENCES: dict[str, Any] = {
    "focus": "balanced",
    "max_tasks_per_day": None,
    "preferred_task_size": None,
    "pinned_topic_ids": [],
    "muted_topic_ids": [],
    "auto_regenerate": True,
}

# Weighting profiles. Each maps the ``focus`` choice to the planner's
# scoring knobs: how much the exam's own priority counts vs. how much the
# user's mastery gap counts, plus the flat high-yield bonus. ``balanced``
# is the planner's original hard-coded blend.
_FOCUS_WEIGHTS: dict[str, dict[str, float]] = {
    "balanced": {"coverage_w": 0.50, "mastery_w": 0.25, "high_yield_bonus": 10.0},
    "weak_areas": {"coverage_w": 0.30, "mastery_w": 0.50, "high_yield_bonus": 5.0},
    "exam_priority": {"coverage_w": 0.65, "mastery_w": 0.10, "high_yield_bonus": 10.0},
    "high_yield": {"coverage_w": 0.45, "mastery_w": 0.20, "high_yield_bonus": 25.0},
}


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("plan_preferences read/write failed: %s", exc)
        return default


def focus_weights(focus: str | None) -> dict[str, float]:
    """Return the planner scoring weights for a ``focus`` choice."""
    return dict(_FOCUS_WEIGHTS.get(focus or "balanced", _FOCUS_WEIGHTS["balanced"]))


def _normalise(row: dict[str, Any] | None) -> dict[str, Any]:
    """Merge a stored row over the defaults, dropping unknown keys."""
    out = dict(DEFAULT_PREFERENCES)
    if row:
        for key in DEFAULT_PREFERENCES:
            if row.get(key) is not None:
                out[key] = row[key]
    out["pinned_topic_ids"] = list(out.get("pinned_topic_ids") or [])
    out["muted_topic_ids"] = list(out.get("muted_topic_ids") or [])
    return out


def get_plan_preferences(supabase: Any, user_id: str) -> dict[str, Any]:
    """Return the user's plan preferences, falling back to defaults."""
    if not user_id:
        return dict(DEFAULT_PREFERENCES)
    rows = (
        _safe(
            lambda: (
                supabase.table("user_study_plan_preferences")
                .select(
                    "id, user_id, focus, max_tasks_per_day, preferred_task_size, "
                    "pinned_topic_ids, muted_topic_ids, auto_regenerate, "
                    "metadata, updated_at"
                )
                .eq("user_id", user_id)
                .limit(1)
                .execute()
                .data
            ),
            default=[],
        )
        or []
    )
    return _normalise(rows[0] if rows else None)


def _clean_topic_ids(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    seen: list[str] = []
    for v in value:
        s = str(v).strip()
        if s and s not in seen:
            seen.append(s)
    return seen


def upsert_plan_preferences(
    supabase: Any, user_id: str, **fields: Any
) -> dict[str, Any]:
    """Validate + persist plan preferences for ``user_id``.

    Only known fields are written; invalid enum values fall back to the
    current (or default) value rather than raising. Returns the resolved
    preference object.
    """
    if not user_id:
        return dict(DEFAULT_PREFERENCES)

    current = get_plan_preferences(supabase, user_id)

    payload: dict[str, Any] = {}
    if "focus" in fields:
        focus = fields["focus"]
        payload["focus"] = focus if focus in _VALID_FOCUS else current["focus"]
    if "max_tasks_per_day" in fields:
        raw = fields["max_tasks_per_day"]
        if raw is None:
            payload["max_tasks_per_day"] = None
        else:
            try:
                payload["max_tasks_per_day"] = max(1, min(8, int(raw)))
            except (TypeError, ValueError):
                payload["max_tasks_per_day"] = current["max_tasks_per_day"]
    if "preferred_task_size" in fields:
        size = fields["preferred_task_size"]
        if size is None or size in _VALID_SIZE:
            payload["preferred_task_size"] = size
        else:
            payload["preferred_task_size"] = current["preferred_task_size"]
    if "pinned_topic_ids" in fields:
        payload["pinned_topic_ids"] = _clean_topic_ids(fields["pinned_topic_ids"])
    if "muted_topic_ids" in fields:
        payload["muted_topic_ids"] = _clean_topic_ids(fields["muted_topic_ids"])
    if "auto_regenerate" in fields:
        payload["auto_regenerate"] = bool(fields["auto_regenerate"])

    if not payload:
        return current

    payload["updated_at"] = datetime.now(timezone.utc).isoformat()

    existing = (
        _safe(
            lambda: (
                supabase.table("user_study_plan_preferences")
                .select("id")
                .eq("user_id", user_id)
                .limit(1)
                .execute()
                .data
            ),
            default=[],
        )
        or []
    )
    if existing:
        _safe(
            lambda: (
                supabase.table("user_study_plan_preferences")
                .update(payload)
                .eq("user_id", user_id)
                .execute()
            )
        )
    else:
        _safe(
            lambda: (
                supabase.table("user_study_plan_preferences")
                .insert({"user_id": user_id, **payload})
                .execute()
            )
        )
    return get_plan_preferences(supabase, user_id)
