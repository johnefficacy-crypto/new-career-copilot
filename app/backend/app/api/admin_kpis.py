"""Leadership KPI dashboard API.

Reads the latest kpi_snapshots row per (family, metric_key) plus a rolling
series. ``POST /api/admin/kpis/recompute`` performs an inline recompute
across the four KPI families using deterministic SQL against existing
tables — when scheduled jobs come online, the worker will call the same
recompute path.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import get_current_user
from app.db.supabase_client import get_supabase_admin


router = APIRouter(prefix="/admin/kpis", tags=["admin-kpis"])

FAMILIES = ("outcome", "trust", "commercial", "quality")


def _require_admin(user: dict = Depends(get_current_user)) -> dict:
    role = (user.get("role") or "").lower()
    if role in {"admin", "super_admin"}:
        return user
    raise HTTPException(status_code=403, detail="Admin role required")


def _safe_count(sb, table: str, **filters) -> int:
    try:
        q = sb.table(table).select("id", count="exact")
        for k, v in filters.items():
            q = q.eq(k, v)
        res = q.execute()
        return int(getattr(res, "count", None) or 0)
    except Exception:
        return 0


def _safe_count_range(sb, table: str, ts_col: str, since: datetime, **filters) -> int:
    try:
        q = sb.table(table).select("id", count="exact").gte(ts_col, since.isoformat())
        for k, v in filters.items():
            q = q.eq(k, v)
        res = q.execute()
        return int(getattr(res, "count", None) or 0)
    except Exception:
        return 0


def _upsert(sb, captured_for: date, family: str, key: str, label: str, value: float, unit: str, target: float | None = None, metadata: dict | None = None) -> None:
    sb.table("kpi_snapshots").upsert(
        {
            "captured_for": captured_for.isoformat(),
            "family": family,
            "metric_key": key,
            "metric_label": label,
            "value": value,
            "unit": unit,
            "target": target,
            "trend_direction": "na",
            "metadata": metadata or {},
            "computed_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="captured_for,family,metric_key",
    ).execute()


def _compute_outcome(sb, day: date) -> list[dict]:
    now = datetime.now(timezone.utc)
    last7 = now - timedelta(days=7)
    active_7d = _safe_count_range(sb, "study_sessions", "started_at", last7)
    completed_tasks_7d = _safe_count_range(sb, "study_tasks", "completed_at", last7)
    mocks_7d = _safe_count_range(sb, "mock_tests", "taken_at", last7)
    notes_7d = _safe_count_range(sb, "personal_notes", "created_at", last7)
    rows = [
        ("active_aspirants_7d", "Active aspirants (7d)", active_7d, "users"),
        ("tasks_completed_7d", "Plan tasks completed (7d)", completed_tasks_7d, "tasks"),
        ("mocks_taken_7d", "Mocks taken (7d)", mocks_7d, "mocks"),
        ("notes_created_7d", "Notes created (7d)", notes_7d, "notes"),
    ]
    for key, label, value, unit in rows:
        _upsert(sb, day, "outcome", key, label, value, unit)
    return [{"key": k, "label": l, "value": v, "unit": u} for k, l, v, u in rows]


def _compute_trust(sb, day: date) -> list[dict]:
    now = datetime.now(timezone.utc)
    last7 = now - timedelta(days=7)
    open_items = _safe_count(sb, "moderation_items", status="open")
    p0_open = _safe_count(sb, "moderation_items", status="open", severity="p0")
    resolved_7d = _safe_count_range(sb, "moderation_items", "resolved_at", last7, status="resolved")
    copyright_open = _safe_count(sb, "copyright_claims", status="received") + _safe_count(sb, "copyright_claims", status="triage")
    rows = [
        ("moderation_open", "Moderation queue (open)", open_items, "items"),
        ("moderation_p0_open", "P0 open", p0_open, "items"),
        ("moderation_resolved_7d", "Resolved (7d)", resolved_7d, "items"),
        ("copyright_open", "Copyright claims open", copyright_open, "claims"),
    ]
    for key, label, value, unit in rows:
        _upsert(sb, day, "trust", key, label, value, unit)
    return [{"key": k, "label": l, "value": v, "unit": u} for k, l, v, u in rows]


def _compute_commercial(sb, day: date) -> list[dict]:
    pro_users = _safe_count(sb, "profiles", plan="pro") + _safe_count(sb, "profiles", plan="elite") + _safe_count(sb, "profiles", plan="premium")
    mentor_bookings = _safe_count(sb, "mentor_bookings", status="confirmed")
    marketplace_resources = _safe_count(sb, "courses")
    rows = [
        ("paid_users", "Paid users", pro_users, "users"),
        ("mentor_bookings_confirmed", "Confirmed mentor bookings", mentor_bookings, "bookings"),
        ("marketplace_resources", "Marketplace resources", marketplace_resources, "resources"),
    ]
    for key, label, value, unit in rows:
        _upsert(sb, day, "commercial", key, label, value, unit)
    return [{"key": k, "label": l, "value": v, "unit": u} for k, l, v, u in rows]


def _compute_quality(sb, day: date) -> list[dict]:
    now = datetime.now(timezone.utc)
    last7 = now - timedelta(days=7)
    failed_exports = _safe_count(sb, "report_exports", status="failed")
    stale_resources = _safe_count(sb, "community_resources", status="pending_review")
    flashcard_reviews_7d = _safe_count_range(sb, "flashcard_reviews", "reviewed_at", last7)
    rows = [
        ("report_failed", "Failed exports (all-time)", failed_exports, "exports"),
        ("stale_resources", "Resources awaiting review", stale_resources, "resources"),
        ("flashcard_reviews_7d", "Flashcard reviews (7d)", flashcard_reviews_7d, "reviews"),
    ]
    for key, label, value, unit in rows:
        _upsert(sb, day, "quality", key, label, value, unit)
    return [{"key": k, "label": l, "value": v, "unit": u} for k, l, v, u in rows]


@router.get("")
def get_dashboard(
    days: int = Query(default=14, ge=1, le=90),
    user: dict = Depends(_require_admin),
) -> dict:
    sb = get_supabase_admin()
    since = (date.today() - timedelta(days=days)).isoformat()
    rows = (
        sb.table("kpi_snapshots")
        .select("*")
        .gte("captured_for", since)
        .order("captured_for", desc=True)
        .limit(2000)
        .execute()
        .data
        or []
    )
    # Latest per (family, metric_key) and a sparkline series.
    latest: dict[tuple[str, str], dict] = {}
    series: dict[tuple[str, str], list[dict]] = {}
    for r in rows:
        key = (r["family"], r["metric_key"])
        if key not in latest:
            latest[key] = r
        series.setdefault(key, []).append({"date": r["captured_for"], "value": float(r.get("value") or 0)})
    by_family: dict[str, list[dict]] = {f: [] for f in FAMILIES}
    for (family, metric_key), r in latest.items():
        by_family.setdefault(family, []).append(
            {
                "key": metric_key,
                "label": r.get("metric_label"),
                "value": float(r.get("value") or 0),
                "unit": r.get("unit"),
                "target": float(r["target"]) if r.get("target") is not None else None,
                "trend": r.get("trend_direction"),
                "captured_for": r.get("captured_for"),
                "series": list(reversed(series.get((family, metric_key), []))),
            }
        )
    return {"families": by_family, "as_of": rows[0]["captured_for"] if rows else None}


@router.post("/recompute")
def recompute(user: dict = Depends(_require_admin)) -> dict:
    sb = get_supabase_admin()
    today = date.today()
    return {
        "captured_for": today.isoformat(),
        "outcome": _compute_outcome(sb, today),
        "trust": _compute_trust(sb, today),
        "commercial": _compute_commercial(sb, today),
        "quality": _compute_quality(sb, today),
    }
