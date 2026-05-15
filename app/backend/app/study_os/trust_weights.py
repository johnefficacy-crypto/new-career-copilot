"""Study OS — trust-adjusted hours + source breakdown (PR 7).

Spec § "Hours trust hierarchy" maps each session source to a weight in [0,1].
This module exposes:

  * ``TRUST_WEIGHTS`` — the canonical map.
  * ``upsert_source_breakdown`` — write per-source rows for a (user, day) and
    re-aggregate the parent snapshot totals.
  * ``read_breakdown`` — read the per-source rows for one day.
"""
from __future__ import annotations

import logging
from datetime import date
from typing import Any, Callable, Iterable

logger = logging.getLogger("career_copilot.study_os.trust_weights")


# Spec § "Hours trust hierarchy".
TRUST_WEIGHTS: dict[str, float] = {
    "platform_verified": 1.00,
    "mentor_verified": 0.95,
    "group_focus_checked": 0.90,
    "group_presence": 0.75,
    "partner_costudy": 0.70,
    "solo_timer": 0.60,
    "screenshot": 0.45,
    "self_claimed": 0.25,
}


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("trust_weights supabase call failed: %s", exc)
        return default


def upsert_source_breakdown(
    supabase: Any,
    user_id: str,
    day: date,
    source_minutes: dict[str, int],
) -> dict[str, Any]:
    """Write one row per source for (user, day). Recomputes parent totals.

    `source_minutes` is ``{source_key: raw_minutes}``. Sources not in
    ``TRUST_WEIGHTS`` are ignored.
    """
    rows = []
    raw_total = 0
    trust_total = 0.0
    for src, mins in source_minutes.items():
        if src not in TRUST_WEIGHTS:
            logger.warning("ignoring unknown trust source: %s", src)
            continue
        try:
            iv = int(mins)
        except (TypeError, ValueError):
            continue
        if iv < 0:
            continue
        w = TRUST_WEIGHTS[src]
        rows.append(
            {
                "user_id": user_id,
                "snapshot_date": day.isoformat(),
                "source": src,
                "raw_minutes": iv,
                "trust_weight": w,
            }
        )
        raw_total += iv
        trust_total += iv * w

    if rows:
        _safe(
            lambda: (
                supabase.table("study_behavior_source_breakdown")
                .upsert(rows, on_conflict="user_id,snapshot_date,source")
                .execute()
            )
        )

    _safe(
        lambda: (
            supabase.table("study_behavior_daily_snapshots")
            .update(
                {
                    "raw_total_minutes": raw_total,
                    "trust_adjusted_minutes": round(trust_total, 2),
                }
            )
            .eq("user_id", user_id)
            .eq("snapshot_date", day.isoformat())
            .execute()
        )
    )

    return {
        "user_id": user_id,
        "snapshot_date": day.isoformat(),
        "raw_total_minutes": raw_total,
        "trust_adjusted_minutes": round(trust_total, 2),
        "sources": rows,
    }


def read_breakdown(supabase: Any, user_id: str, day: date) -> dict[str, Any]:
    rows = _safe(
        lambda: (
            supabase.table("study_behavior_source_breakdown")
            .select("source, raw_minutes, trust_weight, trust_adjusted_minutes")
            .eq("user_id", user_id)
            .eq("snapshot_date", day.isoformat())
            .order("trust_weight", desc=True)
            .execute()
        ),
        default=None,
    )
    items = getattr(rows, "data", None) or []
    raw_total = sum(int(r.get("raw_minutes") or 0) for r in items)
    trust_total = sum(float(r.get("trust_adjusted_minutes") or 0) for r in items)
    return {
        "snapshot_date": day.isoformat(),
        "raw_total_minutes": raw_total,
        "trust_adjusted_minutes": round(trust_total, 2),
        "sources": items,
    }


def aggregate_breakdown_from_sessions(
    supabase: Any, user_id: str, day: date
) -> dict[str, int]:
    """Build a {source: minutes} dict from the day's recorded sessions.

    Pulls from ``study_sessions`` (solo timer) + ``social_study_sessions``
    joined with attendance rows for the user.
    """
    # Solo sessions (default: solo_timer source).
    from datetime import datetime, timedelta, timezone
    start = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc).isoformat()
    end = (
        datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc) + timedelta(days=1)
    ).isoformat()

    solo_rows = _safe(
        lambda: (
            supabase.table("study_sessions")
            .select("duration_minutes, duration_mins")
            .eq("user_id", user_id)
            .gte("started_at", start)
            .lt("started_at", end)
            .execute()
        ),
        default=None,
    )
    solo_mins = 0
    for r in getattr(solo_rows, "data", None) or []:
        try:
            solo_mins += int(r.get("duration_minutes") or r.get("duration_mins") or 0)
        except (TypeError, ValueError):
            continue

    # Social sessions for the user's attendance rows on this date.
    att_rows = _safe(
        lambda: (
            supabase.table("social_session_attendance")
            .select(
                "session_id, presence_minutes, focus_check_passed, focus_check_total, "
                "social_study_sessions:session_id(trust_source, trust_weight, started_at, "
                "verified_focus_minutes, verified_presence_minutes)"
            )
            .eq("user_id", user_id)
            .gte("created_at", start)
            .lt("created_at", end)
            .execute()
        ),
        default=None,
    )
    by_source: dict[str, int] = {"solo_timer": solo_mins} if solo_mins > 0 else {}
    for ar in getattr(att_rows, "data", None) or []:
        sess = ar.get("social_study_sessions") or {}
        src = sess.get("trust_source") or "group_presence"
        # Prefer verified_focus_minutes when the session is focus-checked;
        # otherwise count the per-user presence minutes.
        if src in ("group_focus_checked", "platform_verified", "mentor_verified"):
            mins = int(sess.get("verified_focus_minutes") or 0)
        else:
            mins = int(ar.get("presence_minutes") or 0)
        if mins > 0:
            by_source[src] = by_source.get(src, 0) + mins
    return by_source
