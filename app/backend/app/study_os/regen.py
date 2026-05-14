"""Event-driven Study OS plan regeneration.

Two entry points:

* ``regenerate_on_signal`` — called from a request path (e.g. a logged
  mock that just changed the user's topic mastery). Regenerates the plan
  *only* when the user already has an active plan and hasn't opted out of
  auto-regeneration. It never creates a plan from nothing on a
  side-channel signal — that stays an explicit action.
* ``regenerate_stale_plans`` — a periodic sweep (wired into the
  APScheduler) that refreshes every active plan not already regenerated
  today, for users who keep auto-regeneration on.

Both are fully defensive — they never raise out to their caller.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Callable

from app.study_os.plan_preferences import get_plan_preferences
from app.study_os.planner import generate_plan

logger = logging.getLogger("career_copilot.study_os.regen")


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("regen read failed: %s", exc)
        return default


def _today_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _active_plan(supabase: Any, user_id: str) -> dict[str, Any] | None:
    rows = (
        _safe(
            lambda: (
                supabase.table("study_plans")
                .select("id, status, updated_at")
                .eq("user_id", user_id)
                .eq("status", "active")
                .limit(1)
                .execute()
                .data
            ),
            default=[],
        )
        or []
    )
    return rows[0] if rows else None


def regenerate_on_signal(
    supabase: Any, user_id: str, *, event_type: str, reason: str
) -> dict[str, Any]:
    """Regenerate the user's plan in response to a runtime signal.

    No-ops (returning ``regenerated=False`` with a ``reason``) when the
    user has opted out of auto-regeneration or has no active plan yet.
    """
    if not user_id:
        return {"regenerated": False, "reason": "no_user"}

    prefs = get_plan_preferences(supabase, user_id)
    if not prefs.get("auto_regenerate", True):
        return {"regenerated": False, "reason": "auto_regenerate_off"}

    if not _active_plan(supabase, user_id):
        return {"regenerated": False, "reason": "no_active_plan"}

    result = _safe(
        lambda: generate_plan(
            supabase, user_id, reason=reason, event_type=event_type
        ),
        default=None,
    )
    if not result or not result.get("generated"):
        return {
            "regenerated": False,
            "reason": (result or {}).get("reason", "generate_failed"),
        }
    return {
        "regenerated": True,
        "plan_id": result.get("plan_id"),
        "version_number": result.get("version_number"),
        "task_count": result.get("task_count"),
    }


def regenerate_stale_plans(supabase: Any, *, limit: int = 200) -> dict[str, Any]:
    """Refresh every active plan that hasn't been regenerated today.

    Intended for the daily APScheduler sweep. Users with
    ``auto_regenerate=false`` are skipped; plans already updated today are
    left alone. Returns a small summary; never raises.
    """
    today = _today_iso()
    plans = (
        _safe(
            lambda: (
                supabase.table("study_plans")
                .select("id, user_id, status, updated_at")
                .eq("status", "active")
                .limit(limit)
                .execute()
                .data
            ),
            default=[],
        )
        or []
    )

    checked = 0
    regenerated = 0
    skipped_fresh = 0
    skipped_opt_out = 0
    for plan in plans:
        user_id = plan.get("user_id")
        if not user_id:
            continue
        checked += 1
        if str(plan.get("updated_at") or "")[:10] >= today:
            skipped_fresh += 1
            continue
        prefs = get_plan_preferences(supabase, user_id)
        if not prefs.get("auto_regenerate", True):
            skipped_opt_out += 1
            continue
        result = _safe(
            lambda uid=user_id: generate_plan(
                supabase,
                uid,
                reason="scheduled_stale_refresh",
                event_type="manual_regeneration",
            ),
            default=None,
        )
        if result and result.get("generated"):
            regenerated += 1

    return {
        "checked": checked,
        "regenerated": regenerated,
        "skipped_fresh": skipped_fresh,
        "skipped_opt_out": skipped_opt_out,
    }
