from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from supabase import Client

from app.api.canonical import my_recommendations, profile_completion, weekly_review


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _day_bucket(ts: str | None = None) -> str:
    if ts:
        return str(ts)[:10]
    return date.today().isoformat()


def _priority_for_candidate(notification_type: str, recommendation: dict[str, Any] | None = None) -> int:
    stage = (recommendation or {}).get("recommendation_stage")
    end_date = (recommendation or {}).get("apply_end_date")
    near_48h = False
    if end_date:
        try:
            near_48h = (date.fromisoformat(str(end_date)) - date.today()).days <= 2
        except Exception:
            near_48h = False
    if notification_type in {"apply_deadline_urgent", "continue_application"} and near_48h:
        return 4
    if notification_type in {"submit_form", "continue_application"}:
        return 3
    if notification_type in {"study_backlog_recovery", "weekly_review_ready"}:
        return 2
    if stage == "complete_profile" and near_48h:
        return 4
    return 1


def _candidate_from_recommendation(rec: dict[str, Any]) -> dict[str, Any] | None:
    stage = rec.get("recommendation_stage")
    mapping = {
        "complete_profile": "complete_profile",
        "continue_application": "continue_application",
        "submit_form": "submit_form",
        "prepare_after_submission": "prepare_after_submission",
        "monitor_result": "monitor_result",
    }
    notif_type = mapping.get(stage)
    if not notif_type and stage == "apply_now":
        try:
            if rec.get("apply_end_date") and (date.fromisoformat(str(rec["apply_end_date"])) - date.today()).days <= 2:
                notif_type = "apply_deadline_urgent"
        except Exception:
            notif_type = None
    if not notif_type:
        return None
    return {
        "notification_type": notif_type,
        "recruitment_id": rec.get("recruitment_id"),
        "priority": _priority_for_candidate(notif_type, rec),
        "title": f"Next action: {stage.replace('_', ' ').title()}",
        "body": rec.get("next_action") or "Review your next action.",
    }


def _dedupe_key(user_id: str, recruitment_id: str | None, notification_type: str, bucket: str) -> str:
    return f"{user_id}:{recruitment_id or 'global'}:{notification_type}:{bucket}"


def _already_exists_today(supabase: Client, *, user_id: str, recruitment_id: str | None, notification_type: str, bucket: str) -> bool:
    rows = (
        supabase.table("notification_alerts")
        .select("id,sent_at")
        .eq("user_id", user_id)
        .eq("alert_type", notification_type)
        .eq("recruitment_id", recruitment_id)
        .gte("sent_at", f"{bucket}T00:00:00")
        .lt("sent_at", f"{bucket}T23:59:59")
        .limit(1)
        .execute()
        .data
        or []
    )
    return bool(rows)


async def generate_next_actions_for_user(*, supabase: Client, user: dict[str, Any], day_bucket: str | None = None, dry_run: bool = False) -> dict[str, Any]:
    bucket = day_bucket or _day_bucket()
    recs = await my_recommendations(user)
    review = await weekly_review(user)
    completion = await profile_completion(user)
    candidates = []

    for rec in recs.get("items", []):
        c = _candidate_from_recommendation(rec)
        if c:
            candidates.append(c)

    if (review.get("backlog_count") or 0) > 3 or (review.get("missed_tasks") or 0) > 3:
        candidates.append({"notification_type": "study_backlog_recovery", "recruitment_id": None, "priority": 2, "title": "Study backlog recovery", "body": "Your backlog is rising. Recover one overdue block today."})
    if (review.get("hours_planned") or 0) > 0:
        candidates.append({"notification_type": "weekly_review_ready", "recruitment_id": None, "priority": 2, "title": "Weekly review ready", "body": "Review your weekly progress and corrections."})
    if (completion.get("eligibility_profile", {}).get("completion_pct") or 0) < 100:
        candidates.append({"notification_type": "complete_profile", "recruitment_id": None, "priority": 1, "title": "Complete your eligibility profile", "body": "Add missing profile details to improve recommendation quality."})

    created = skipped = 0
    by_type: dict[str, int] = {}
    for c in candidates:
        if _already_exists_today(supabase, user_id=user["id"], recruitment_id=c.get("recruitment_id"), notification_type=c["notification_type"], bucket=bucket):
            skipped += 1
            continue
        payload = {
            "user_id": user["id"],
            "recruitment_id": c.get("recruitment_id"),
            "alert_type": c["notification_type"],
            "priority": c["priority"],
            "is_read": False,
            "sent_at": _now_iso(),
            "generated_at": _now_iso(),
            "title": c.get("title"),
            "body": c.get("body"),
            "source": "next_action_engine",
            "source_stage": c.get("notification_type"),
            "dedupe_key": _dedupe_key(user["id"], c.get("recruitment_id"), c["notification_type"], bucket),
        }
        if dry_run:
            created += 0
            by_type[c["notification_type"]] = by_type.get(c["notification_type"], 0) + 1
            continue
        supabase.table("notification_alerts").upsert(payload, on_conflict="dedupe_key").execute()
        created += 1
        by_type[c["notification_type"]] = by_type.get(c["notification_type"], 0) + 1
    return {"created": created, "skipped": skipped, "candidates": len(candidates), "by_type": by_type}
