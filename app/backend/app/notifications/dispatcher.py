"""Notification dispatcher — render + send unread alerts.

Channel adapters:
    * **in_app**   — already in ``notification_alerts``; nothing to do.
    * **email**    — sends via Resend if ``RESEND_API_KEY`` is set,
                     otherwise logs the rendered body. Marks
                     ``notification_alerts.email_sent=true`` once delivered.
    * **whatsapp** — Phase-3 placeholder (logs only).

The dispatcher is **idempotent**: it only picks up rows where
``email_sent=false`` AND the alert type passes the user's preference
filters AND the kill switch is off.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any

import httpx
from supabase import Client


def _looks_like_missing_email_sent(exc: Exception) -> bool:
    text = str(exc)
    return "email_sent" in text and (
        "does not exist" in text
        or "PGRST204" in text
        or "schema cache" in text
        or "42703" in text
    )

logger = logging.getLogger("career_copilot.notifications.dispatcher")


# ─── Kill switch ────────────────────────────────────────────────────────────


def kill_switch_enabled(supabase: Client) -> bool:
    try:
        rows = (
            supabase.table("admin_settings")
            .select("value")
            .eq("key", "notifications_paused")
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            return False
        return str(rows[0].get("value")).lower() == "true"
    except Exception as exc:  # noqa: BLE001
        logger.warning("kill_switch_enabled lookup failed: %s", exc)
        return False  # fail-open — better to send than to block forever


def set_kill_switch(supabase: Client, *, paused: bool, actor_id: str | None) -> None:
    """Idempotent upsert of the global notifications_paused flag."""
    payload = {
        "key": "notifications_paused",
        "value": "true" if paused else "false",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if actor_id:
        payload["updated_by"] = actor_id
    supabase.table("admin_settings").upsert(payload, on_conflict="key").execute()


# ─── Preference filters ─────────────────────────────────────────────────────


_PRIORITY_RANK: dict[str, int] = {"low": 1, "normal": 2, "medium": 2, "high": 3, "critical": 4}


def _allowed_for_user(prefs: dict[str, Any] | None, channel: str, alert: dict[str, Any]) -> bool:
    p = prefs or {}
    if channel == "email":
        if not p.get("email_enabled", True):
            return False
        floor = _PRIORITY_RANK.get(p.get("min_priority_email") or "normal", 2)
    elif channel == "in_app":
        if not p.get("in_app_enabled", True):
            return False
        floor = _PRIORITY_RANK.get(p.get("min_priority_in_app") or "low", 1)
    else:
        return False

    # alert.priority is a smallint where higher = more urgent (1..4 used in repo)
    return int(alert.get("priority") or 1) >= floor and (
        alert.get("alert_type") not in (p.get("event_types_muted") or [])
    )


# ─── Template rendering ─────────────────────────────────────────────────────


_SUBJECTS: dict[str, str] = {
    "new_match":      "🎯 New recruitment matches your profile — {recruitment_name}",
    "deadline_3day":  "⏰ Apply window closes in 3 days — {recruitment_name}",
    "deadline_1day":  "🚨 Last day to apply — {recruitment_name}",
    "result_declared": "📣 Result declared — {recruitment_name}",
    "default":        "Career Copilot — {recruitment_name}",
}

_BODIES: dict[str, str] = {
    "new_match": (
        "Hi,\n\n"
        "{recruitment_name} matches your eligibility profile.\n"
        "Apply window: {apply_start} → {apply_end}.\n\n"
        "Open in Career Copilot: {url}\n"
        "— The Career Copilot eligibility engine"
    ),
    "deadline_3day": (
        "Hi,\n\n"
        "Just 3 days left to apply for {recruitment_name}.\n"
        "Closes: {apply_end}.\n\n"
        "Open in Career Copilot: {url}\n"
        "— Career Copilot"
    ),
    "deadline_1day": (
        "Hi,\n\n"
        "Today is the last day to apply for {recruitment_name}.\n"
        "Closes: {apply_end}.\n\n"
        "Apply: {url}\n"
        "— Career Copilot"
    ),
    "default": (
        "Hi,\n\n{recruitment_name} — {alert_type}.\n\n"
        "Open in Career Copilot: {url}"
    ),
}


def _render_email(alert: dict[str, Any]) -> tuple[str, str]:
    rec = alert.get("recruitment") or {}
    org = (rec.get("organization") or {}) if isinstance(rec, dict) else {}
    rec_name = rec.get("name") or "your tracked recruitment"
    org_name = org.get("name") or ""
    if org_name and org_name not in rec_name:
        rec_name = f"{rec_name} · {org_name}"

    ctx = {
        "recruitment_name": rec_name,
        "alert_type": alert.get("alert_type"),
        "apply_start": (rec.get("apply_start_date") if isinstance(rec, dict) else None) or "—",
        "apply_end": (rec.get("apply_end_date") if isinstance(rec, dict) else None) or "—",
        "url": f"{os.environ.get('PUBLIC_APP_URL', '').rstrip('/')}/app/exams/{alert.get('recruitment_id')}",
    }
    alert_type = alert.get("alert_type") or "default"
    subject = _SUBJECTS.get(alert_type, _SUBJECTS["default"]).format(**ctx)
    body = _BODIES.get(alert_type, _BODIES["default"]).format(**ctx)
    return subject, body


# ─── Channel adapters ───────────────────────────────────────────────────────


_RESEND_ENDPOINT = "https://api.resend.com/emails"


def _send_email(*, to: str, subject: str, body: str) -> dict[str, Any]:
    """Send via Resend if configured, otherwise log and return a mock id."""
    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    from_addr = (
        os.environ.get("RESEND_FROM_EMAIL")
        or os.environ.get("RESEND_FROM")
        or "Career Copilot <onboarding@resend.dev>"
    )

    if not api_key:
        logger.info("[email:LOG-ONLY] to=%s subject=%s body=%r", to, subject, body[:200])
        return {"ok": True, "id": "logged-only", "channel": "email", "delivered": False}

    try:
        resp = httpx.post(
            _RESEND_ENDPOINT,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"from": from_addr, "to": [to], "subject": subject, "text": body},
            timeout=10.0,
        )
        resp.raise_for_status()
        data = resp.json()
        return {"ok": True, "id": data.get("id"), "channel": "email", "delivered": True}
    except Exception as exc:  # noqa: BLE001
        logger.warning("[email:RESEND] failed to %s: %s", to, exc)
        return {"ok": False, "channel": "email", "error": str(exc)}


# ─── Dispatcher entrypoint ──────────────────────────────────────────────────


def dispatch_pending_alerts(
    supabase: Client,
    *,
    limit: int = 100,
) -> dict[str, int]:
    """Pick up unread + email-not-yet-sent alerts and send them.

    Returns ``{checked, in_app, emailed, skipped, failed, killed}``.
    """
    if kill_switch_enabled(supabase):
        logger.info("notification dispatch skipped: kill_reason=notifications_paused")
        return {"checked": 0, "in_app": 0, "emailed": 0, "skipped": 0, "failed": 0, "killed": 1}

    try:
        rows = (
            supabase.table("notification_alerts")
            .select(
                "id, user_id, recruitment_id, alert_type, is_read, priority, email_sent, "
                "recruitment:recruitments ( name, apply_start_date, apply_end_date, "
                "organization:organizations ( name ) )"
            )
            .eq("email_sent", False)
            .order("priority", desc=True)
            .order("sent_at", desc=False, nullsfirst=False)
            .limit(limit)
            .execute()
            .data
            or []
        )
    except Exception as exc:  # noqa: BLE001
        if not _looks_like_missing_email_sent(exc):
            raise
        logger.warning("notification email dispatch skipped; notification_alerts.email_sent is missing")
        return {"checked": 0, "in_app": 0, "emailed": 0, "skipped": 0, "failed": 0, "killed": 0}
    if not rows:
        return {"checked": 0, "in_app": 0, "emailed": 0, "skipped": 0, "failed": 0, "killed": 0}

    user_ids = list({a["user_id"] for a in rows if a.get("user_id")})

    prefs_map: dict[str, dict[str, Any]] = {}
    if user_ids:
        try:
            for p in (
                supabase.table("notification_preferences")
                .select("*")
                .in_("user_id", user_ids)
                .execute()
                .data
                or []
            ):
                prefs_map[p["user_id"]] = p
        except Exception as exc:  # noqa: BLE001
            logger.warning("prefs lookup failed: %s", exc)

    # Resolve user emails via the auth admin API (one call per user).
    emails_map: dict[str, str | None] = {}
    for uid in user_ids:
        try:
            user_resp = supabase.auth.admin.get_user_by_id(uid)
            user_obj = getattr(user_resp, "user", None) or user_resp
            emails_map[uid] = getattr(user_obj, "email", None) if user_obj else None
        except Exception as exc:  # noqa: BLE001
            logger.warning("auth admin lookup failed for %s: %s", uid, exc)
            emails_map[uid] = None

    in_app = emailed = skipped = failed = 0
    for alert in rows:
        uid = alert["user_id"]
        prefs = prefs_map.get(uid)

        if not _allowed_for_user(prefs, "in_app", alert):
            skipped += 1
        else:
            in_app += 1  # already in DB; we just count it as "delivered to in-app"

        if not _allowed_for_user(prefs, "email", alert):
            # Mark it sent=True to stop re-checking. The user opted out.
            try:
                supabase.table("notification_alerts").update(
                    {"email_sent": True}
                ).eq("id", alert["id"]).execute()
            except Exception:
                pass
            continue

        to = emails_map.get(uid)
        if not to:
            skipped += 1
            continue
        subject, body = _render_email(alert)
        result = _send_email(to=to, subject=subject, body=body)
        if result.get("ok"):
            try:
                supabase.table("notification_alerts").update(
                    {"email_sent": True}
                ).eq("id", alert["id"]).execute()
            except Exception as exc:  # noqa: BLE001
                logger.warning("mark email_sent failed: %s", exc)
            emailed += 1
        else:
            failed += 1

    return {
        "checked": len(rows),
        "in_app": in_app,
        "emailed": emailed,
        "skipped": skipped,
        "failed": failed,
        "killed": 0,
    }
