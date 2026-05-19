"""Admin-only persona controls (PR4).

Read/light-write surface for operators to inspect the persona system
built in PR1+PR2+PR3. Strictly admin-gated via the existing
``require_permission`` helper (super_admin bypasses the perm check —
matches every other admin router in this repo).

No new tables. No write to canonical profile rows. No deletion of
persona snapshots or question answers.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth import require_permission
from app.db.supabase_client import get_supabase_admin
from app.persona.queue import enqueue_persona_recompute, process_pending_persona_recompute
from app.persona_questions.bank import invalidate_bank_cache

logger = logging.getLogger("career_copilot.api.admin_persona")

# Permission key — falls back to super_admin in require_permission.
ADMIN_PERM = "persona.manage"

router = APIRouter(prefix="/admin/persona", tags=["admin-persona"])


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("admin_persona supabase call failed: %s", exc)
        return default


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_hours_ago(hours: int) -> str:
    return (_now() - timedelta(hours=hours)).isoformat()


def _as_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


# Snapshots older than this are "stale" — their evidence may no longer
# reflect the aspirant's current behaviour and they should be recomputed.
_STALE_SNAPSHOT_HOURS = 24 * 14
# Score threshold above which a snapshot is flagged as a high-risk cohort.
_HIGH_RISK_THRESHOLD = 0.6


def _clamp(value: int, low: int, high: int) -> int:
    try:
        v = int(value)
    except (TypeError, ValueError):
        return low
    return max(low, min(high, v))


# ─── 1. Overview ──────────────────────────────────────────────────────────
@router.get("/overview")
def overview(_admin: dict = Depends(require_permission(ADMIN_PERM))) -> dict[str, Any]:
    sb = get_supabase_admin()
    since_24h = _iso_hours_ago(24)

    snapshots_total = len(
        _safe(
            lambda: sb.table("aspirant_persona_snapshots").select("id").limit(10000).execute().data,
            default=[],
        )
        or []
    )
    snapshots_24h = len(
        _safe(
            lambda: (
                sb.table("aspirant_persona_snapshots")
                .select("id")
                .gte("computed_at", since_24h)
                .limit(10000)
                .execute()
                .data
            ),
            default=[],
        )
        or []
    )
    latest_version_row = _safe(
        lambda: (
            sb.table("aspirant_persona_snapshots")
            .select("persona_version")
            .order("computed_at", desc=True)
            .limit(1)
            .execute()
            .data
        ),
        default=[],
    ) or []
    latest_version = latest_version_row[0]["persona_version"] if latest_version_row else None

    bank_rows = _safe(
        lambda: sb.table("persona_question_bank").select("id, is_active").limit(1000).execute().data,
        default=[],
    ) or []
    active_questions = sum(1 for r in bank_rows if r.get("is_active"))
    inactive_questions = len(bank_rows) - active_questions

    answers_24h = len(
        _safe(
            lambda: (
                sb.table("persona_question_answers")
                .select("id")
                .gte("created_at", since_24h)
                .limit(10000)
                .execute()
                .data
            ),
            default=[],
        )
        or []
    )

    queue_rows = _safe(
        lambda: (
            sb.table("persona_recompute_queue")
            .select("id, status, processed_at, created_at")
            .limit(10000)
            .execute()
            .data
        ),
        default=[],
    ) or []
    pending = sum(1 for r in queue_rows if r.get("status") == "pending")
    failed = sum(1 for r in queue_rows if r.get("status") == "failed")
    completed_24h = sum(
        1
        for r in queue_rows
        if r.get("status") == "completed"
        and (r.get("processed_at") or "") >= since_24h
    )

    events_24h = len(
        _safe(
            lambda: (
                sb.table("user_signal_events")
                .select("id")
                .gte("created_at", since_24h)
                .limit(10000)
                .execute()
                .data
            ),
            default=[],
        )
        or []
    )
    unprocessed_events = len(
        _safe(
            lambda: (
                sb.table("user_signal_events")
                .select("id")
                .is_("processed_at", None)
                .limit(10000)
                .execute()
                .data
            ),
            default=[],
        )
        or []
    )

    # Snapshot detail read — drives risk cohorts, staleness, dimension
    # distribution, and policy-generation health. One extra read, capped
    # like every other read in this overview.
    snapshot_detail = _safe(
        lambda: (
            sb.table("aspirant_persona_snapshots")
            .select("id, scores, dimensions, study_policy, computed_at")
            .limit(10000)
            .execute()
            .data
        ),
        default=[],
    ) or []
    stale_cutoff = _iso_hours_ago(_STALE_SNAPSHOT_HOURS)
    high_study_risk = 0
    high_dropoff_risk = 0
    stale_snapshots = 0
    snapshots_with_policy = 0
    dimension_distribution: dict[str, dict[str, int]] = {}
    for row in snapshot_detail:
        scores = row.get("scores")
        if isinstance(scores, dict):
            sr = _as_float(scores.get("study_risk"))
            if sr is not None and sr >= _HIGH_RISK_THRESHOLD:
                high_study_risk += 1
            dr = _as_float(scores.get("dropoff_risk"))
            if dr is not None and dr >= _HIGH_RISK_THRESHOLD:
                high_dropoff_risk += 1
        if (row.get("computed_at") or "") < stale_cutoff:
            stale_snapshots += 1
        if row.get("study_policy"):
            snapshots_with_policy += 1
        dims = row.get("dimensions")
        if isinstance(dims, dict):
            for dim_key, dim_val in dims.items():
                if dim_val is None:
                    continue
                slot = dimension_distribution.setdefault(dim_key, {})
                slot[str(dim_val)] = slot.get(str(dim_val), 0) + 1

    # Keep only the top 3 values per dimension so the admin card stays compact.
    top_distribution = {
        dim: dict(sorted(values.items(), key=lambda kv: kv[1], reverse=True)[:3])
        for dim, values in dimension_distribution.items()
    }
    if not snapshot_detail:
        policy_generation_status = "no_data"
    elif snapshots_with_policy == len(snapshot_detail):
        policy_generation_status = "ok"
    elif snapshots_with_policy > 0:
        policy_generation_status = "partial"
    else:
        policy_generation_status = "missing"

    return {
        "snapshots": {
            "total": snapshots_total,
            "computed_24h": snapshots_24h,
            "latest_version": latest_version,
            "stale": stale_snapshots,
        },
        "questions": {
            "active": active_questions,
            "inactive": inactive_questions,
            "answers_24h": answers_24h,
        },
        "queue": {
            "pending": pending,
            "failed": failed,
            "completed_24h": completed_24h,
        },
        "signals": {
            "events_24h": events_24h,
            "unprocessed": unprocessed_events,
        },
        "risk": {
            "high_study_risk": high_study_risk,
            "high_dropoff_risk": high_dropoff_risk,
            "threshold": _HIGH_RISK_THRESHOLD,
        },
        "dimensions": {
            "distribution": top_distribution,
        },
        "policy": {
            "generation_status": policy_generation_status,
            "with_policy": snapshots_with_policy,
        },
        "generated_at": _now().isoformat(),
    }


# ─── 2. Question bank list ────────────────────────────────────────────────
_QUESTION_COLUMNS = (
    "id, question_key, field_key, question_text, help_text, data_type, "
    "options, target_dimension, target_profile_group, profile_table, "
    "profile_column, priority, trigger_rules, applies_when, is_active, "
    "created_at, updated_at"
)


@router.get("/question-bank")
def list_question_bank(
    active: str = Query("all", pattern="^(all|true|false)$"),
    q: str | None = Query(None, max_length=200),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0, le=10000),
    _admin: dict = Depends(require_permission(ADMIN_PERM)),
) -> dict[str, Any]:
    sb = get_supabase_admin()

    def _builder():
        q_builder = sb.table("persona_question_bank").select(_QUESTION_COLUMNS)
        if active == "true":
            q_builder = q_builder.eq("is_active", True)
        elif active == "false":
            q_builder = q_builder.eq("is_active", False)
        return q_builder.order("priority").limit(limit).execute().data

    rows = _safe(_builder, default=[]) or []
    if q:
        needle = q.lower()
        rows = [
            r
            for r in rows
            if needle in (r.get("question_key") or "").lower()
            or needle in (r.get("question_text") or "").lower()
            or needle in (r.get("target_dimension") or "").lower()
        ]
    # offset is applied client-side because supabase-py's range() varies
    # across versions; the table is small so this is cheap.
    paginated = rows[offset : offset + limit]
    return {"items": paginated, "count": len(rows)}


# ─── 3. Question bank patch ───────────────────────────────────────────────
_PATCHABLE_FIELDS = {
    "question_text",
    "help_text",
    "options",
    "priority",
    "is_active",
    "trigger_rules",
    "applies_when",
}


class QuestionPatch(BaseModel):
    question_text: str | None = Field(default=None, max_length=500)
    help_text: str | None = Field(default=None, max_length=500)
    options: list[Any] | None = None
    priority: int | None = Field(default=None, ge=0, le=10_000)
    is_active: bool | None = None
    trigger_rules: dict[str, Any] | None = None
    applies_when: dict[str, Any] | None = None


@router.patch("/question-bank/{question_key}")
def patch_question(
    question_key: str,
    body: QuestionPatch = Body(...),
    _admin: dict = Depends(require_permission(ADMIN_PERM)),
) -> dict[str, Any]:
    sb = get_supabase_admin()
    existing_rows = _safe(
        lambda: (
            sb.table("persona_question_bank")
            .select(_QUESTION_COLUMNS)
            .eq("question_key", question_key)
            .limit(1)
            .execute()
            .data
        ),
        default=[],
    ) or []
    if not existing_rows:
        raise HTTPException(status_code=404, detail="Unknown question_key")
    existing = existing_rows[0]

    payload = body.model_dump(exclude_unset=True)
    if not payload:
        return existing

    # Field-by-field validation.
    if "question_text" in payload:
        if not isinstance(payload["question_text"], str) or not payload["question_text"].strip():
            raise HTTPException(status_code=400, detail="question_text must be a non-empty string")
        payload["question_text"] = payload["question_text"].strip()

    if "options" in payload and payload["options"] is not None:
        data_type = existing.get("data_type")
        if data_type in {"single_select", "multi_select"}:
            if not isinstance(payload["options"], list) or not payload["options"]:
                raise HTTPException(
                    status_code=400, detail="options must be a non-empty array for select questions"
                )
            # Normalise option shape to {value, label}.
            normalised: list[dict[str, Any]] = []
            for opt in payload["options"]:
                if isinstance(opt, dict) and "value" in opt:
                    normalised.append(
                        {"value": opt["value"], "label": opt.get("label") or str(opt["value"])}
                    )
                elif isinstance(opt, str):
                    normalised.append({"value": opt, "label": opt})
                else:
                    raise HTTPException(
                        status_code=400, detail="Each option must be a string or {value, label}"
                    )
            payload["options"] = normalised

    if "priority" in payload and not isinstance(payload["priority"], int):
        raise HTTPException(status_code=400, detail="priority must be an integer")

    # Forbid fields outside the allowlist.
    for k in payload.keys():
        if k not in _PATCHABLE_FIELDS:
            raise HTTPException(status_code=400, detail=f"Field '{k}' is not patchable in PR4")

    payload["updated_at"] = _now().isoformat()
    updated_rows = _safe(
        lambda: (
            sb.table("persona_question_bank")
            .update(payload)
            .eq("question_key", question_key)
            .execute()
            .data
        ),
        default=None,
    )
    if not updated_rows:
        raise HTTPException(status_code=500, detail="Question update failed")
    # Read path caches list_active_questions for 10 minutes; bust it so
    # the next onboarding fetch sees this edit.
    invalidate_bank_cache()
    return updated_rows[0]


# ─── 4. Snapshots list ────────────────────────────────────────────────────
_SNAPSHOT_COMPACT_COLUMNS = (
    "id, user_id, persona_version, primary_persona, dimensions, scores, "
    "study_policy, computed_at"
)


@router.get("/snapshots")
def list_snapshots(
    user_id: str | None = Query(None),
    persona_version: str | None = Query(None, max_length=40),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0, le=10000),
    _admin: dict = Depends(require_permission(ADMIN_PERM)),
) -> dict[str, Any]:
    sb = get_supabase_admin()

    def _builder():
        q = sb.table("aspirant_persona_snapshots").select(_SNAPSHOT_COMPACT_COLUMNS)
        if user_id:
            q = q.eq("user_id", user_id)
        if persona_version:
            q = q.eq("persona_version", persona_version)
        return q.order("computed_at", desc=True).limit(limit + offset).execute().data

    rows = _safe(_builder, default=[]) or []
    paginated = rows[offset : offset + limit]
    return {"items": paginated, "count": len(rows)}


# ─── 5. User inspector ────────────────────────────────────────────────────
@router.get("/users/{user_id}")
def inspect_user(
    user_id: str,
    _admin: dict = Depends(require_permission(ADMIN_PERM)),
) -> dict[str, Any]:
    sb = get_supabase_admin()

    recent_snapshots = _safe(
        lambda: (
            sb.table("aspirant_persona_snapshots")
            .select(_SNAPSHOT_COMPACT_COLUMNS)
            .eq("user_id", user_id)
            .order("computed_at", desc=True)
            .limit(10)
            .execute()
            .data
        ),
        default=[],
    ) or []
    latest = recent_snapshots[0] if recent_snapshots else None

    recent_answers = _safe(
        lambda: (
            sb.table("persona_question_answers")
            .select(
                "id, question_key, normalized_value, answer_value, skipped, "
                "source, created_at"
            )
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(25)
            .execute()
            .data
        ),
        default=[],
    ) or []

    recent_events = _safe(
        lambda: (
            sb.table("user_signal_events")
            .select("id, event_type, payload, processed_at, created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(25)
            .execute()
            .data
        ),
        default=[],
    ) or []

    queue_items = _safe(
        lambda: (
            sb.table("persona_recompute_queue")
            .select(
                "id, user_id, reason, status, attempts, error_message, "
                "created_at, processed_at"
            )
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(25)
            .execute()
            .data
        ),
        default=[],
    ) or []

    return {
        "user_id": user_id,
        "latest_snapshot": latest,
        "recent_snapshots": recent_snapshots,
        "recent_question_answers": recent_answers,
        "recent_signal_events": recent_events,
        "queue_items": queue_items,
    }


# ─── 6. Admin recompute for a user ────────────────────────────────────────
class RecomputeBody(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=128)
    reason: str | None = Field(default="admin_requested", max_length=200)


@router.post("/recompute-user")
def recompute_user(
    body: RecomputeBody,
    _admin: dict = Depends(require_permission(ADMIN_PERM)),
) -> dict[str, Any]:
    sb = get_supabase_admin()
    reason = (body.reason or "admin_requested").strip() or "admin_requested"
    try:
        enqueue_persona_recompute(sb, body.user_id, reason)
    except Exception as exc:  # noqa: BLE001
        logger.warning("admin recompute enqueue failed: %s", exc)
        raise HTTPException(status_code=500, detail="Could not enqueue recompute")
    return {"queued": True, "user_id": body.user_id, "reason": reason}


# ─── 7. Recompute queue list ──────────────────────────────────────────────
_QUEUE_STATUSES = {"pending", "processing", "completed", "failed", "all"}


@router.get("/recompute-queue")
def list_queue(
    status: str = Query("all"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0, le=10000),
    _admin: dict = Depends(require_permission(ADMIN_PERM)),
) -> dict[str, Any]:
    if status not in _QUEUE_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status filter")
    sb = get_supabase_admin()

    def _builder():
        q = sb.table("persona_recompute_queue").select(
            "id, user_id, reason, status, attempts, error_message, created_at, processed_at"
        )
        if status != "all":
            q = q.eq("status", status)
        return q.order("created_at", desc=True).limit(limit + offset).execute().data

    rows = _safe(_builder, default=[]) or []
    return {"items": rows[offset : offset + limit], "count": len(rows)}


# ─── 8. Drain queue (admin-triggered) ─────────────────────────────────────
class ProcessQueueBody(BaseModel):
    limit: int = Field(default=25, ge=1, le=100)


@router.post("/recompute-queue/process")
def process_queue(
    body: ProcessQueueBody | None = Body(default=None),
    _admin: dict = Depends(require_permission(ADMIN_PERM)),
) -> dict[str, Any]:
    sb = get_supabase_admin()
    limit = body.limit if body else 25
    try:
        results = process_pending_persona_recompute(sb, limit=limit)
    except Exception as exc:  # noqa: BLE001
        logger.exception("admin process_queue failed")
        raise HTTPException(status_code=500, detail=f"Process queue failed: {exc}")
    processed = sum(1 for r in results if r.get("status") == "completed")
    failed = sum(1 for r in results if r.get("status") == "failed")
    return {"processed": processed, "failed": failed, "items": results}


# ─── 9. Signal events list ────────────────────────────────────────────────
@router.get("/signal-events")
def list_signal_events(
    user_id: str | None = Query(None),
    event_type: str | None = Query(None, max_length=80),
    processed: str | None = Query(None, pattern="^(true|false)$"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0, le=10000),
    _admin: dict = Depends(require_permission(ADMIN_PERM)),
) -> dict[str, Any]:
    sb = get_supabase_admin()

    def _builder():
        q = sb.table("user_signal_events").select(
            "id, user_id, event_type, payload, processed_at, created_at"
        )
        if user_id:
            q = q.eq("user_id", user_id)
        if event_type:
            q = q.eq("event_type", event_type)
        if processed == "false":
            q = q.is_("processed_at", None)
        elif processed == "true":
            q = q.neq("processed_at", None)
        return q.order("created_at", desc=True).limit(limit + offset).execute().data

    rows = _safe(_builder, default=[]) or []
    return {"items": rows[offset : offset + limit], "count": len(rows)}
