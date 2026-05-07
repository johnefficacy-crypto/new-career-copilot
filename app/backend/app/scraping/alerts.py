"""Notification alert helpers — port of ``lib/scraping/alerts.ts``.

These run **after** a recruitment is promoted into canonical (or daily
for deadline sweeps). They never decide eligibility — they just fan out
``notification_alerts`` rows for users whose ``eligibility_results``
already say ``is_eligible=true`` for the recruitment.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any

from supabase import Client

logger = logging.getLogger("career_copilot.scraping.alerts")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def alert_users_for_new_recruitment(recruitment_id: str, supabase: Client) -> int:
    """One ``new_match`` alert per eligible user. Idempotent on
    ``(user_id, recruitment_id, alert_type)``."""
    rows = (
        supabase.table("eligibility_results")
        .select("user_id")
        .eq("recruitment_id", recruitment_id)
        .eq("is_eligible", True)
        .execute()
        .data
        or []
    )
    if not rows:
        return 0

    user_ids = list({r["user_id"] for r in rows})
    payload = [
        {
            "user_id": uid,
            "recruitment_id": recruitment_id,
            "alert_type": "new_match",
            "is_read": False,
            "priority": 3,
            "sent_at": _now(),
        }
        for uid in user_ids
    ]
    try:
        supabase.table("notification_alerts").upsert(
            payload, on_conflict="user_id,recruitment_id,alert_type"
        ).execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning("alertUsersForNewRecruitment: %s", exc)
        return 0
    return len(user_ids)


def send_deadline_alerts(supabase: Client) -> dict[str, int]:
    """Daily sweep — alert eligible users about apply windows closing in 1 / 3 days."""
    today = date.today()
    in_3 = (today + timedelta(days=3)).isoformat()
    in_1 = (today + timedelta(days=1)).isoformat()

    closing_3 = (
        supabase.table("recruitments")
        .select("id")
        .eq("apply_end_date", in_3)
        .eq("status", "open")
        .execute()
        .data
        or []
    )
    closing_1 = (
        supabase.table("recruitments")
        .select("id")
        .eq("apply_end_date", in_1)
        .eq("status", "open")
        .execute()
        .data
        or []
    )

    three = sum(_alert_users_for_deadline(r["id"], "deadline_3day", supabase) for r in closing_3)
    one = sum(_alert_users_for_deadline(r["id"], "deadline_1day", supabase) for r in closing_1)
    return {"three_day": three, "one_day": one}


def _alert_users_for_deadline(recruitment_id: str, alert_type: str, supabase: Client) -> int:
    rows = (
        supabase.table("eligibility_results")
        .select("user_id")
        .eq("recruitment_id", recruitment_id)
        .eq("is_eligible", True)
        .execute()
        .data
        or []
    )
    if not rows:
        return 0
    payload = [
        {
            "user_id": r["user_id"],
            "recruitment_id": recruitment_id,
            "alert_type": alert_type,
            "is_read": False,
            "priority": 4 if alert_type == "deadline_1day" else 3,
            "sent_at": _now(),
        }
        for r in rows
    ]
    try:
        supabase.table("notification_alerts").upsert(
            payload, on_conflict="user_id,recruitment_id,alert_type"
        ).execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning("deadline alert failed: %s", exc)
        return 0
    return len(rows)


def get_user_alerts(
    user_id: str,
    supabase: Client,
    *,
    unread_only: bool = False,
    limit: int = 20,
) -> list[dict[str, Any]]:
    q = (
        supabase.table("notification_alerts")
        .select(
            "*, recruitment:recruitments ( id, slug, name, apply_end_date, status, "
            "organization:organizations ( name ) )"
        )
        .eq("user_id", user_id)
        .order("sent_at", desc=True)
        .limit(limit)
    )
    if unread_only:
        q = q.eq("is_read", False)
    return q.execute().data or []


def get_unread_alert_count(user_id: str, supabase: Client) -> int:
    resp = (
        supabase.table("notification_alerts")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .eq("is_read", False)
        .execute()
    )
    return resp.count or 0


def mark_alerts_read(user_id: str, supabase: Client, *, alert_ids: list[str] | None = None) -> int:
    q = (
        supabase.table("notification_alerts")
        .update({"is_read": True, "read_at": _now()})
        .eq("user_id", user_id)
    )
    if alert_ids:
        q = q.in_("id", alert_ids)
    else:
        q = q.eq("is_read", False)
    res = q.execute()
    return len(res.data or [])
