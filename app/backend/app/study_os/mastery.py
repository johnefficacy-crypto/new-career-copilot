"""Phase 6 — deterministic user-topic mastery + error-pattern derivation.

Reads a user's ``mock_topic_breakdowns`` (joined through ``mock_tests``)
and recomputes ``user_topic_mastery`` and ``user_topic_error_patterns``.

Pure aggregation — no AI, no silent estimation. Fully idempotent: the
same evidence always produces the same rows, because every recompute
aggregates *all* of a user's breakdowns rather than mutating running
state. Every read/write is wrapped so a failure here never breaks the
caller (mock submission).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

logger = logging.getLogger("career_copilot.study_os.mastery")

# error_type values permitted by the migration-033 check constraint.
_VALID_ERROR_TYPES = {
    "concept_gap",
    "memory_gap",
    "careless",
    "speed_issue",
    "misread_question",
    "option_trap",
    "formula_confusion",
    "time_management",
    "unknown",
}

# Spaced-revision interval (days) by mastery band — lower mastery revises sooner.
_REVISION_DAYS = {"low": 2, "medium": 5, "high": 10}

# Number of contributing mocks at which confidence saturates.
_CONFIDENCE_SATURATION = 3


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("mastery read/write failed: %s", exc)
        return default


def _num(value: Any) -> float:
    try:
        return float(value) if value is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def _mastery_band(score: float) -> str:
    if score >= 75:
        return "high"
    if score >= 45:
        return "medium"
    return "low"


def _next_revision(last_practiced: str | None, band: str) -> str | None:
    if not last_practiced:
        return None
    try:
        base = datetime.fromisoformat(str(last_practiced).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
    return (base + timedelta(days=_REVISION_DAYS[band])).isoformat()


def _existing_row(
    supabase: Any, table: str, match: dict[str, Any]
) -> dict[str, Any] | None:
    """Find one row matching every key in ``match`` (``None`` matched as IS NULL)."""

    def _q():
        q = supabase.table(table).select("id")
        for key, val in match.items():
            q = q.is_(key, None) if val is None else q.eq(key, val)
        return q.limit(1).execute().data

    rows = _safe(_q, default=[]) or []
    return rows[0] if rows else None


def _upsert(supabase: Any, table: str, match: dict[str, Any], payload: dict[str, Any]) -> None:
    existing = _existing_row(supabase, table, match)
    if existing:
        _safe(
            lambda: supabase.table(table)
            .update(payload)
            .eq("id", existing["id"])
            .execute()
        )
    else:
        _safe(lambda: supabase.table(table).insert({**match, **payload}).execute())


def _load_user_mock_breakdowns(
    supabase: Any, user_id: str
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    """Return ``(breakdown_rows, mock_meta_by_id)`` for one user.

    ``mock_meta_by_id`` maps ``mock_test_id`` to the mock's exam scoping
    and ``attempted_at`` so breakdowns can be grouped per exam/phase.
    """
    mocks = _safe(
        lambda: (
            supabase.table("mock_tests")
            .select("id, exam_id, exam_phase_id, attempted_at")
            .eq("user_id", user_id)
            .limit(2000)
            .execute()
            .data
        ),
        default=[],
    ) or []
    mock_meta = {m["id"]: m for m in mocks if m.get("id")}
    if not mock_meta:
        return [], {}

    breakdowns = _safe(
        lambda: (
            supabase.table("mock_topic_breakdowns")
            .select(
                "mock_test_id, subject_id, topic_id, total_questions, "
                "correct_answers, wrong_answers, avg_time_sec, error_types"
            )
            .in_("mock_test_id", list(mock_meta.keys()))
            .limit(20000)
            .execute()
            .data
        ),
        default=[],
    ) or []
    return breakdowns, mock_meta


def recompute_topic_mastery(supabase: Any, user_id: str) -> dict[str, Any]:
    """Recompute ``user_topic_mastery`` + ``user_topic_error_patterns``.

    Aggregates every ``mock_topic_breakdowns`` row the user has, grouped by
    ``(topic_id, exam_id, exam_phase_id)``. Returns a small summary dict;
    never raises.
    """
    if not user_id:
        return {"mastery_rows": 0, "error_pattern_rows": 0}

    breakdowns, mock_meta = _load_user_mock_breakdowns(supabase, user_id)
    if not breakdowns:
        return {"mastery_rows": 0, "error_pattern_rows": 0}

    # group key: (topic_id, exam_id, exam_phase_id)
    groups: dict[tuple, dict[str, Any]] = {}
    for b in breakdowns:
        topic_id = b.get("topic_id")
        if not topic_id:
            continue
        meta = mock_meta.get(b.get("mock_test_id")) or {}
        key = (topic_id, meta.get("exam_id"), meta.get("exam_phase_id"))
        g = groups.setdefault(
            key,
            {
                "correct": 0.0,
                "wrong": 0.0,
                "evidence_count": 0,
                "last_practiced_at": None,
                "errors": {},
            },
        )
        g["correct"] += _num(b.get("correct_answers"))
        g["wrong"] += _num(b.get("wrong_answers"))
        g["evidence_count"] += 1
        attempted_at = meta.get("attempted_at")
        if attempted_at and (
            g["last_practiced_at"] is None or str(attempted_at) > str(g["last_practiced_at"])
        ):
            g["last_practiced_at"] = attempted_at
        for raw_type, count in (b.get("error_types") or {}).items():
            etype = raw_type if raw_type in _VALID_ERROR_TYPES else "unknown"
            g["errors"][etype] = g["errors"].get(etype, 0) + int(_num(count))
            g["errors"].setdefault(f"_seen::{etype}", attempted_at)

    mastery_rows = 0
    error_pattern_rows = 0
    for (topic_id, exam_id, exam_phase_id), g in groups.items():
        attempted = g["correct"] + g["wrong"]
        accuracy = round(g["correct"] / attempted * 100, 2) if attempted else 0.0
        band = _mastery_band(accuracy)
        confidence = round(min(1.0, g["evidence_count"] / _CONFIDENCE_SATURATION), 3)
        match = {
            "user_id": user_id,
            "topic_id": topic_id,
            "exam_id": exam_id,
            "exam_phase_id": exam_phase_id,
        }
        _upsert(
            supabase,
            "user_topic_mastery",
            match,
            {
                # mastery_score is accuracy-derived for v1 — an honest,
                # deterministic signal; confidence_score carries evidence volume.
                "mastery_score": accuracy,
                "accuracy_score": accuracy,
                "confidence_score": confidence,
                "last_practiced_at": g["last_practiced_at"],
                "next_revision_at": _next_revision(g["last_practiced_at"], band),
                "evidence_count": g["evidence_count"],
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        mastery_rows += 1

        for etype in _VALID_ERROR_TYPES:
            freq = g["errors"].get(etype, 0)
            if freq <= 0:
                continue
            _upsert(
                supabase,
                "user_topic_error_patterns",
                {
                    "user_id": user_id,
                    "topic_id": topic_id,
                    "exam_id": exam_id,
                    "exam_phase_id": exam_phase_id,
                    "error_type": etype,
                },
                {
                    "frequency_count": freq,
                    "last_seen_at": g["errors"].get(f"_seen::{etype}")
                    or datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                },
            )
            error_pattern_rows += 1

    return {"mastery_rows": mastery_rows, "error_pattern_rows": error_pattern_rows}
