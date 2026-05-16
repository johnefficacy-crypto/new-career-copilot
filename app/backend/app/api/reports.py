"""Downloadable Reports API.

User-facing report export request + status + delivery. Generation runs
inline for the JSON/CSV formats we can compute deterministically from
existing Supabase tables (weekly_summary, mistake_book, flashcard
performance, mock analytics, study log, subject mastery). PDF is queued
as 'pending' so a worker can pick it up; the row carries enough state
that the UI can poll for readiness.
"""
from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth import get_current_user
from app.db.supabase_client import get_supabase_admin


router = APIRouter(prefix="/reports", tags=["reports"])

REPORT_TYPES = {
    "weekly_summary",
    "mistake_book",
    "flashcard_performance",
    "mock_analytics",
    "study_log",
    "subject_mastery",
    "report_card",
}
FORMATS = {"pdf", "csv", "json"}


def _is_uuid(v: Any) -> bool:
    try:
        UUID(str(v))
        return True
    except (TypeError, ValueError, AttributeError):
        return False


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _shape(row: dict) -> dict:
    return {
        "id": row.get("id"),
        "report_type": row.get("report_type"),
        "format": row.get("format"),
        "params": row.get("params") or {},
        "status": row.get("status"),
        "file_url": row.get("file_url"),
        "file_size_bytes": row.get("file_size_bytes"),
        "error_message": row.get("error_message"),
        "requested_at": row.get("requested_at"),
        "started_at": row.get("started_at"),
        "completed_at": row.get("completed_at"),
        "expires_at": row.get("expires_at"),
    }


# ───────────────────────── Generators ─────────────────────────


def _gen_mistake_book(sb, user_id: str, params: dict) -> tuple[list[dict], list[str]]:
    rows = (
        sb.table("mistake_entries")
        .select("created_at,subject_id,root_cause,status,question_text,correct_answer,reason,tags")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(5000)
        .execute()
        .data
        or []
    )
    columns = ["created_at", "subject_id", "root_cause", "status", "question_text", "correct_answer", "reason", "tags"]
    return rows, columns


def _gen_flashcard_perf(sb, user_id: str, params: dict) -> tuple[list[dict], list[str]]:
    rows = (
        sb.table("flashcard_reviews")
        .select("reviewed_at,card_id,rating,duration_ms,prev_interval_days,new_interval_days")
        .eq("user_id", user_id)
        .order("reviewed_at", desc=True)
        .limit(10000)
        .execute()
        .data
        or []
    )
    columns = ["reviewed_at", "card_id", "rating", "duration_ms", "prev_interval_days", "new_interval_days"]
    return rows, columns


def _gen_study_log(sb, user_id: str, params: dict) -> tuple[list[dict], list[str]]:
    rows = (
        sb.table("study_sessions")
        .select("*")
        .eq("user_id", user_id)
        .order("started_at", desc=True)
        .limit(2000)
        .execute()
        .data
        or []
    )
    columns = list(rows[0].keys()) if rows else ["id", "started_at", "duration_minutes"]
    return rows, columns


def _gen_subject_mastery(sb, user_id: str, params: dict) -> tuple[list[dict], list[str]]:
    rows = (
        sb.table("subject_mastery_snapshots")
        .select("*")
        .eq("user_id", user_id)
        .order("snapshot_date", desc=True)
        .limit(2000)
        .execute()
        .data
        or []
    )
    columns = list(rows[0].keys()) if rows else ["id", "subject_id", "mastery_score"]
    return rows, columns


def _gen_mock_analytics(sb, user_id: str, params: dict) -> tuple[list[dict], list[str]]:
    rows = (
        sb.table("mock_tests")
        .select("*")
        .eq("user_id", user_id)
        .order("taken_at", desc=True)
        .limit(500)
        .execute()
        .data
        or []
    )
    columns = list(rows[0].keys()) if rows else ["id", "taken_at", "score"]
    return rows, columns




def _gen_report_card(sb, user_id: str, params: dict) -> tuple[list[dict], list[str]]:
    q = sb.table("study_report_cards").select("*").eq("user_id", user_id)
    period = (params or {}).get("period")
    if period:
        q = q.eq("period_type", period)
    rows = q.order("period_start", desc=True).limit(120).execute().data or []
    columns = list(rows[0].keys()) if rows else ["id", "period_type", "period_start", "scores"]
    return rows, columns

def _gen_weekly_summary(sb, user_id: str, params: dict) -> tuple[list[dict], list[str]]:
    rows = (
        sb.table("weekly_reviews")
        .select("*")
        .eq("user_id", user_id)
        .order("week_start", desc=True)
        .limit(52)
        .execute()
        .data
        or []
    )
    columns = list(rows[0].keys()) if rows else ["id", "week_start", "summary"]
    return rows, columns


GENERATORS = {
    "weekly_summary": _gen_weekly_summary,
    "mistake_book": _gen_mistake_book,
    "flashcard_performance": _gen_flashcard_perf,
    "mock_analytics": _gen_mock_analytics,
    "study_log": _gen_study_log,
    "subject_mastery": _gen_subject_mastery,
    "report_card": _gen_report_card,
}


def _rows_to_csv(rows: list[dict], columns: list[str]) -> str:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for r in rows:
        flat = {k: (json.dumps(v) if isinstance(v, (list, dict)) else v) for k, v in r.items()}
        writer.writerow({c: flat.get(c, "") for c in columns})
    return buf.getvalue()


def _rows_to_json(rows: list[dict]) -> str:
    return json.dumps(rows, default=str, indent=2)


# ───────────────────────── Routes ─────────────────────────


class ReportRequest(BaseModel):
    report_type: str
    format: str = "csv"
    params: dict[str, Any] = Field(default_factory=dict)


@router.get("/types")
def list_types() -> dict:
    return {
        "report_types": sorted(REPORT_TYPES),
        "formats": sorted(FORMATS),
    }


@router.get("")
def list_reports(
    limit: int = Query(default=50, ge=1, le=200),
    user: dict = Depends(get_current_user),
) -> dict:
    sb = get_supabase_admin()
    rows = (
        sb.table("report_exports")
        .select("*")
        .eq("user_id", user["id"])
        .order("requested_at", desc=True)
        .limit(limit)
        .execute()
        .data
        or []
    )
    return {"reports": [_shape(r) for r in rows]}


@router.post("")
def request_report(body: ReportRequest, user: dict = Depends(get_current_user)) -> dict:
    if body.report_type not in REPORT_TYPES:
        raise HTTPException(status_code=400, detail=f"Unknown report_type; expected one of {sorted(REPORT_TYPES)}")
    if body.format not in FORMATS:
        raise HTTPException(status_code=400, detail=f"Unknown format; expected one of {sorted(FORMATS)}")
    sb = get_supabase_admin()
    now = _now()
    expires = now + timedelta(days=7)
    base = {
        "user_id": user["id"],
        "report_type": body.report_type,
        "format": body.format,
        "params": body.params or {},
        "requested_at": now.isoformat(),
        "expires_at": expires.isoformat(),
    }

    if body.format == "pdf":
        # Queue for worker.
        inserted = sb.table("report_exports").insert({**base, "status": "pending"}).execute().data
        if not inserted:
            raise HTTPException(status_code=500, detail="Failed to enqueue report")
        return _shape(inserted[0])

    # Inline generate JSON / CSV.
    inserted = (
        sb.table("report_exports")
        .insert({**base, "status": "generating", "started_at": now.isoformat()})
        .execute()
        .data
    )
    if not inserted:
        raise HTTPException(status_code=500, detail="Failed to start report")
    report_id = inserted[0]["id"]
    try:
        rows, columns = GENERATORS[body.report_type](sb, user["id"], body.params or {})
        content = _rows_to_csv(rows, columns) if body.format == "csv" else _rows_to_json(rows)
        # Store payload in metadata column-less by reusing params.last_payload truncated.
        completed = (
            sb.table("report_exports")
            .update(
                {
                    "status": "ready",
                    "completed_at": _now().isoformat(),
                    "file_size_bytes": len(content.encode("utf-8")),
                    "params": {**(body.params or {}), "row_count": len(rows)},
                }
            )
            .eq("id", report_id)
            .execute()
            .data
        )
        # Returning the body via a separate fetch endpoint keeps the table clean.
        # Stash the content on the row as a data URL so the frontend can grab it.
        sb.table("report_exports").update(
            {"file_url": f"inline:{body.format}:{report_id}"}
        ).eq("id", report_id).execute()
        # Cache the content in-memory for the inline fetch route.
        _INLINE_CACHE[report_id] = (body.format, content)
        return {**_shape(completed[0] if completed else {}), "content_preview": content[:2000]}
    except Exception as exc:  # noqa: BLE001
        sb.table("report_exports").update(
            {"status": "failed", "error_message": str(exc)[:500], "completed_at": _now().isoformat()}
        ).eq("id", report_id).execute()
        raise HTTPException(status_code=500, detail=f"Report generation failed: {exc}")


@router.get("/{report_id}")
def get_report(report_id: str, user: dict = Depends(get_current_user)) -> dict:
    if not _is_uuid(report_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    sb = get_supabase_admin()
    row = (
        sb.table("report_exports")
        .select("*")
        .eq("id", report_id)
        .eq("user_id", user["id"])
        .limit(1)
        .execute()
        .data
    )
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    return _shape(row[0])


# Per-process in-memory cache for inline-generated payloads. Survives until
# pod restart; this is acceptable for free CSV/JSON exports.
_INLINE_CACHE: dict[str, tuple[str, str]] = {}


@router.get("/{report_id}/download")
def download_report(report_id: str, user: dict = Depends(get_current_user)) -> dict:
    if not _is_uuid(report_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    sb = get_supabase_admin()
    row = (
        sb.table("report_exports")
        .select("*")
        .eq("id", report_id)
        .eq("user_id", user["id"])
        .limit(1)
        .execute()
        .data
    )
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    r = row[0]
    if r.get("status") != "ready":
        raise HTTPException(status_code=409, detail=f"Report status is '{r.get('status')}', not ready")
    cached = _INLINE_CACHE.get(report_id)
    if cached:
        fmt, content = cached
        return {"format": fmt, "content": content, "filename": f"{r.get('report_type')}_{report_id}.{fmt}"}
    # PDFs or expired-from-cache rows: tell client to retry later.
    if (r.get("file_url") or "").startswith("inline:"):
        raise HTTPException(status_code=410, detail="Inline payload expired — please re-request")
    return {"format": r.get("format"), "file_url": r.get("file_url"), "filename": f"{r.get('report_type')}_{report_id}.{r.get('format')}"}
