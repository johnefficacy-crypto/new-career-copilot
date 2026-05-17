"""Study OS — Mocks analysis service.

Production-grade replacement for the in-memory placeholder mock endpoints.
Persists every mock and its analysis surface (subject breakdown, weak
topics, error patterns, review state) in Supabase Postgres.

Tables touched (all owned by migration 017 + 062):
  * mock_tests (extended with review_state, weak_topics, error_patterns)
  * mock_subject_breakdowns
  * mock_correction_tasks

The correction-task generator is rule-based and explainable — no AI is
used to decide which gaps to address.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Callable, Iterable

logger = logging.getLogger("career_copilot.study_os.mocks")


# ───────────────────────────── helpers ──────────────────────────────────────
def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("study_os.mocks supabase call failed: %s", exc)
        return default


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _round(value: Any, ndigits: int = 1) -> float | None:
    try:
        return round(float(value), ndigits)
    except (TypeError, ValueError):
        return None


def _percentage(scored: Any, total: Any) -> float | None:
    try:
        s = float(scored)
        t = float(total)
        if t <= 0:
            return None
        return round((s / t) * 100, 1)
    except (TypeError, ValueError):
        return None


VALID_REVIEW_STATES = {"scheduled", "unreviewed", "reviewed", "correction_drafted"}
VALID_CORRECTION_CATEGORIES = {
    "concept_gap",
    "memory_gap",
    "careless",
    "speed_issue",
    "option_trap",
}


# ──────────────────────────── serialisers ───────────────────────────────────
def _serialise_mock(row: dict[str, Any], breakdowns: Iterable[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Public Mock shape returned to the frontend."""
    scored = row.get("scored_marks") or 0
    total = row.get("total_marks") or 0
    correct = row.get("correct_answers") or 0
    wrong = row.get("wrong_answers") or 0
    attempted = row.get("questions_attempted")
    if attempted is None:
        attempted = (correct or 0) + (wrong or 0)
    return {
        "id": row.get("id"),
        "name": row.get("test_name") or row.get("title") or "Mock",
        "exam_slug": row.get("exam_name") or "",
        "score": scored,
        "max_score": total,
        "percentage": _percentage(scored, total) or 0,
        "duration_min": row.get("duration_mins") or 0,
        "correct": correct,
        "wrong": wrong,
        "attempted": attempted,
        "weak_topics": list(row.get("weak_topics") or []),
        "error_patterns": dict(row.get("error_patterns") or {}),
        "review_state": row.get("review_state") or "unreviewed",
        "attempted_at": row.get("attempted_at"),
        "subject_breakdown": [
            _serialise_breakdown(b) for b in (breakdowns or [])
        ],
    }


def _serialise_breakdown(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "subject": row.get("subject"),
        "total_questions": row.get("total_questions"),
        "correct_answers": row.get("correct_answers"),
        "wrong_answers": row.get("wrong_answers"),
        "marks": row.get("marks"),
        "accuracy": row.get("accuracy"),
    }


def _serialise_correction(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "mock_id": row.get("mock_test_id"),
        "category": row.get("category"),
        "title": row.get("title"),
        "topic": row.get("topic"),
        "source_questions": list(row.get("source_questions") or []),
        "state": row.get("state") or "drafted",
        "study_task_id": row.get("study_task_id"),
        "created_at": row.get("created_at"),
        "applied_at": row.get("applied_at"),
    }


# ─────────────────────────── read operations ────────────────────────────────
def list_mocks(supabase: Any, user_id: str, limit: int = 50) -> list[dict[str, Any]]:
    """Return mocks for a user, newest first, with subject breakdowns inlined."""
    rows = (
        _safe(
            lambda: (
                supabase.table("mock_tests")
                .select("*")
                .eq("user_id", user_id)
                .order("attempted_at", desc=True)
                .limit(limit)
                .execute()
            ),
            default=None,
        )
    )
    items = getattr(rows, "data", None) or []
    if not items:
        return []

    mock_ids = [r["id"] for r in items if r.get("id")]
    breakdown_map: dict[str, list[dict[str, Any]]] = {}
    if mock_ids:
        breakdowns = _safe(
            lambda: (
                supabase.table("mock_subject_breakdowns")
                .select("*")
                .in_("mock_test_id", mock_ids)
                .execute()
            ),
            default=None,
        )
        for b in (getattr(breakdowns, "data", None) or []):
            breakdown_map.setdefault(b["mock_test_id"], []).append(b)

    return [_serialise_mock(r, breakdown_map.get(r["id"], [])) for r in items]


def get_mock(supabase: Any, user_id: str, mock_id: str) -> dict[str, Any] | None:
    rows = _safe(
        lambda: (
            supabase.table("mock_tests")
            .select("*")
            .eq("id", mock_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        ),
        default=None,
    )
    items = getattr(rows, "data", None) or []
    if not items:
        return None
    row = items[0]
    breakdowns = _safe(
        lambda: (
            supabase.table("mock_subject_breakdowns")
            .select("*")
            .eq("mock_test_id", mock_id)
            .execute()
        ),
        default=None,
    )
    return _serialise_mock(row, getattr(breakdowns, "data", None) or [])


def list_correction_tasks(supabase: Any, user_id: str, mock_id: str) -> list[dict[str, Any]]:
    rows = _safe(
        lambda: (
            supabase.table("mock_correction_tasks")
            .select("*")
            .eq("user_id", user_id)
            .eq("mock_test_id", mock_id)
            .order("created_at", desc=True)
            .execute()
        ),
        default=None,
    )
    return [_serialise_correction(r) for r in (getattr(rows, "data", None) or [])]


def mock_trend(mocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Reverse-chronological list → simple ordered trend points."""
    ordered = list(reversed(mocks or []))
    return [
        {"id": m.get("id"), "name": m.get("name"), "percentage": m.get("percentage")}
        for m in ordered
    ]


# ─────────────────────────── write operations ───────────────────────────────
def create_mock(
    supabase: Any,
    user_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Persist a new mock log + its subject breakdowns.

    The frontend speaks the legacy {name, exam_slug, score, max_score,
    duration_min, attempted, correct, weak_topics, error_patterns,
    subject_breakdown} shape — we map it onto the production columns.
    """
    score = payload.get("score")
    max_score = payload.get("max_score")
    attempted = payload.get("attempted")
    correct = payload.get("correct")
    wrong = None
    if correct is not None and attempted is not None:
        try:
            wrong = max(0, int(attempted) - int(correct))
        except (TypeError, ValueError):
            wrong = None

    row = {
        "user_id": user_id,
        "test_name": payload.get("name") or "Mock",
        "title": payload.get("name") or "Mock",
        "exam_name": payload.get("exam_slug") or None,
        "scored_marks": score,
        "total_marks": max_score,
        "duration_mins": payload.get("duration_min"),
        "correct_answers": correct,
        "wrong_answers": wrong,
        "questions_attempted": attempted,
        "weak_topics": list(payload.get("weak_topics") or []),
        "error_patterns": dict(payload.get("error_patterns") or {}),
        "review_state": payload.get("review_state") or "unreviewed",
        "attempted_at": payload.get("attempted_at") or _now_iso(),
        "notes": payload.get("notes"),
    }

    inserted = _safe(
        lambda: supabase.table("mock_tests").insert(row).execute(),
        default=None,
    )
    items = getattr(inserted, "data", None) or []
    if not items:
        raise RuntimeError("mock_tests insert returned no row")
    mock = items[0]
    mock_id = mock["id"]

    breakdowns_payload = []
    for b in payload.get("subject_breakdown") or []:
        if not b or not b.get("subject"):
            continue
        breakdowns_payload.append({
            "mock_test_id": mock_id,
            "subject": b.get("subject"),
            "total_questions": b.get("total_questions"),
            "correct_answers": b.get("correct_answers"),
            "wrong_answers": b.get("wrong_answers"),
            "marks": b.get("marks"),
            "accuracy": b.get("accuracy"),
        })
    breakdown_rows: list[dict[str, Any]] = []
    if breakdowns_payload:
        bins = _safe(
            lambda: supabase.table("mock_subject_breakdowns")
            .insert(breakdowns_payload)
            .execute(),
            default=None,
        )
        breakdown_rows = getattr(bins, "data", None) or []

    return _serialise_mock(mock, breakdown_rows)


def set_review_state(
    supabase: Any,
    user_id: str,
    mock_id: str,
    state: str,
) -> dict[str, Any]:
    if state not in VALID_REVIEW_STATES:
        raise ValueError(f"invalid review state: {state}")
    updated = _safe(
        lambda: (
            supabase.table("mock_tests")
            .update({"review_state": state, "updated_at": _now_iso()})
            .eq("id", mock_id)
            .eq("user_id", user_id)
            .execute()
        ),
        default=None,
    )
    items = getattr(updated, "data", None) or []
    if not items:
        raise LookupError("mock not found")
    return _serialise_mock(items[0])


# ─────────────────────── correction-task generation ─────────────────────────
# Mapping from prototype categories to a default task title template.
_CORRECTION_DEFAULTS = {
    "concept_gap": "Concept drill",
    "memory_gap": "Spaced revision",
    "careless": "Accuracy drill",
    "speed_issue": "Timed retrieval set",
    "option_trap": "Distractor elimination drill",
}


def _draft_corrections_from_mock(mock: dict[str, Any]) -> list[dict[str, Any]]:
    """Pure rule-based correction-task suggestion.

    Reads the mock's `error_patterns` and `weak_topics` and emits one task
    per category that has any signal. Deterministic — no randomness.
    """
    out: list[dict[str, Any]] = []
    errors = mock.get("error_patterns") or {}
    weak = list(mock.get("weak_topics") or [])

    # error_patterns keys map directly onto correction categories.
    mapping = {
        "concept": "concept_gap",
        "memory": "memory_gap",
        "careless": "careless",
        "time": "speed_issue",
        "option": "option_trap",
    }
    for key, count in errors.items():
        try:
            n = int(count or 0)
        except (TypeError, ValueError):
            n = 0
        if n <= 0:
            continue
        cat = mapping.get(key, key if key in VALID_CORRECTION_CATEGORIES else None)
        if not cat or cat not in VALID_CORRECTION_CATEGORIES:
            continue
        topic = weak[0] if weak else None
        out.append({
            "category": cat,
            "title": f"{_CORRECTION_DEFAULTS[cat]}{' · ' + topic if topic else ''}",
            "topic": topic,
            "source_questions": [],
        })

    # If no error_patterns at all but there are weak topics, draft one
    # concept-gap drill per weak topic (capped at 3).
    if not out and weak:
        for t in weak[:3]:
            out.append({
                "category": "concept_gap",
                "title": f"{_CORRECTION_DEFAULTS['concept_gap']} · {t}",
                "topic": t,
                "source_questions": [],
            })
    return out


def draft_correction_tasks(
    supabase: Any,
    user_id: str,
    mock_id: str,
) -> list[dict[str, Any]]:
    """Generate + persist correction-task suggestions for a mock.

    Replaces any prior drafted (not-yet-applied) corrections for the mock.
    Flips the mock's review_state to ``correction_drafted``.
    """
    mock = get_mock(supabase, user_id, mock_id)
    if not mock:
        raise LookupError("mock not found")

    drafts = _draft_corrections_from_mock(mock)

    # Wipe stale drafts (state='drafted') so we don't accumulate duplicates.
    _safe(
        lambda: (
            supabase.table("mock_correction_tasks")
            .delete()
            .eq("user_id", user_id)
            .eq("mock_test_id", mock_id)
            .eq("state", "drafted")
            .execute()
        ),
    )

    rows = []
    if drafts:
        payload = [
            {
                "mock_test_id": mock_id,
                "user_id": user_id,
                "category": d["category"],
                "title": d["title"],
                "topic": d.get("topic"),
                "source_questions": d.get("source_questions") or [],
                "state": "drafted",
            }
            for d in drafts
        ]
        inserted = _safe(
            lambda: supabase.table("mock_correction_tasks").insert(payload).execute(),
            default=None,
        )
        rows = getattr(inserted, "data", None) or []

    # Mark the mock as having draft corrections.
    _safe(
        lambda: (
            supabase.table("mock_tests")
            .update({"review_state": "correction_drafted", "updated_at": _now_iso()})
            .eq("id", mock_id)
            .eq("user_id", user_id)
            .execute()
        ),
    )

    return [_serialise_correction(r) for r in rows]


def apply_correction_task(
    supabase: Any,
    user_id: str,
    correction_id: str,
) -> dict[str, Any]:
    """Push a drafted correction task into the user's study_tasks.

    Creates a study_tasks row tagged as a correction task and links it
    back via mock_correction_tasks.study_task_id + state='applied'.
    """
    rows = _safe(
        lambda: (
            supabase.table("mock_correction_tasks")
            .select("*")
            .eq("id", correction_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        ),
        default=None,
    )
    items = getattr(rows, "data", None) or []
    if not items:
        raise LookupError("correction task not found")
    correction = items[0]
    if correction.get("state") == "applied":
        return _serialise_correction(correction)

    # Find the user's active plan to attach the task to. plan_id may
    # be null if no active plan — the task still persists.
    plan_id = None
    plans = _safe(
        lambda: (
            supabase.table("study_plans")
            .select("id")
            .eq("user_id", user_id)
            .eq("status", "active")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        ),
        default=None,
    )
    plan_items = getattr(plans, "data", None) or []
    if plan_items:
        plan_id = plan_items[0].get("id")

    task_payload = {
        "user_id": user_id,
        "plan_id": plan_id,
        "title": correction.get("title"),
        "task_type": "mock_correction",
        "topic": correction.get("topic"),
        "status": "planned",
        "metadata": {
            "source": "mock_correction",
            "mock_test_id": correction.get("mock_test_id"),
            "category": correction.get("category"),
            "source_questions": correction.get("source_questions") or [],
        },
    }
    inserted = _safe(
        lambda: supabase.table("study_tasks").insert(task_payload).execute(),
        default=None,
    )
    task_items = getattr(inserted, "data", None) or []
    if not task_items:
        raise RuntimeError("could not create study task")
    task = task_items[0]

    updated = _safe(
        lambda: (
            supabase.table("mock_correction_tasks")
            .update({
                "state": "applied",
                "study_task_id": task["id"],
                "applied_at": _now_iso(),
            })
            .eq("id", correction_id)
            .eq("user_id", user_id)
            .execute()
        ),
        default=None,
    )
    updated_items = getattr(updated, "data", None) or []
    if updated_items:
        return _serialise_correction(updated_items[0])
    correction.update({
        "state": "applied",
        "study_task_id": task["id"],
        "applied_at": _now_iso(),
    })
    return _serialise_correction(correction)


def dismiss_correction_task(
    supabase: Any,
    user_id: str,
    correction_id: str,
) -> dict[str, Any]:
    updated = _safe(
        lambda: (
            supabase.table("mock_correction_tasks")
            .update({"state": "dismissed"})
            .eq("id", correction_id)
            .eq("user_id", user_id)
            .execute()
        ),
        default=None,
    )
    items = getattr(updated, "data", None) or []
    if not items:
        raise LookupError("correction task not found")
    return _serialise_correction(items[0])


# ──────────────────────────── analysis bundle ───────────────────────────────
def get_mock_analysis(
    supabase: Any,
    user_id: str,
    mock_id: str,
) -> dict[str, Any] | None:
    """Single-shot bundle the analysis screen needs for one mock."""
    mock = get_mock(supabase, user_id, mock_id)
    if not mock:
        return None
    corrections = list_correction_tasks(supabase, user_id, mock_id)
    return {
        "mock": mock,
        "subject_breakdown": mock.get("subject_breakdown") or [],
        "weak_topics": mock.get("weak_topics") or [],
        "error_patterns": mock.get("error_patterns") or {},
        "review_state": mock.get("review_state") or "unreviewed",
        "correction_tasks": corrections,
    }


# ─── Subject-breakdown recompute service ─────────────────────────────────


def recompute_subject_breakdowns(supabase: Any, mock_id: str) -> dict[str, Any]:
    """Rebuild ``mock_subject_breakdowns`` for one mock by aggregating
    per-topic data from ``mock_topic_breakdowns``.

    Use case: a mock was logged with subject totals but per-topic
    breakdowns came in later via the review flow, or the original
    subject totals were entered by hand and have drifted from the
    topic-level truth. Recompute deletes existing subject rows for
    the mock and re-inserts them from a topics→subject group-by.

    Returns ``{outcome: ok|no_change|error, breakdowns_before, breakdowns_after}``.
    Never raises — caller decides what to do with ``outcome``.
    """
    try:
        topic_rows = _safe(
            lambda: supabase.table("mock_topic_breakdowns")
            .select("topic_id, subject_id, total_questions, correct_answers, wrong_answers, marks, accuracy")
            .eq("mock_test_id", mock_id)
            .execute()
            .data,
            default=[],
        ) or []

        before = _safe(
            lambda: supabase.table("mock_subject_breakdowns")
            .select("id", count="exact")
            .eq("mock_test_id", mock_id)
            .execute(),
            default=None,
        )
        before_count = int(getattr(before, "count", 0) or 0)

        if not topic_rows:
            return {"outcome": "no_change", "breakdowns_before": before_count, "breakdowns_after": before_count, "reason": "no_topic_data"}

        # Resolve missing subject_ids by joining with topics. Topic rows
        # written via the review flow already carry subject_id, so this
        # is just a safety net for rows that were inserted before that.
        missing_subject = {t.get("topic_id") for t in topic_rows if not t.get("subject_id") and t.get("topic_id")}
        topic_to_subject: dict[str, str | None] = {}
        if missing_subject:
            joined = _safe(
                lambda: supabase.table("topics")
                .select("id, subject_id")
                .in_("id", list(missing_subject))
                .execute()
                .data,
                default=[],
            ) or []
            topic_to_subject = {r.get("id"): r.get("subject_id") for r in joined}

        agg: dict[str, dict[str, Any]] = {}
        for t in topic_rows:
            sid = t.get("subject_id") or topic_to_subject.get(t.get("topic_id"))
            if not sid:
                continue  # orphaned topic — can't roll up
            slot = agg.setdefault(sid, {
                "subject_id": sid,
                "total_questions": 0,
                "correct_answers": 0,
                "wrong_answers": 0,
                "marks": 0.0,
            })
            for k in ("total_questions", "correct_answers", "wrong_answers"):
                v = t.get(k)
                if isinstance(v, (int, float)):
                    slot[k] += int(v)
            m = t.get("marks")
            if isinstance(m, (int, float)):
                slot["marks"] += float(m)

        rows = []
        for sid, slot in agg.items():
            total = slot["total_questions"] or 0
            correct = slot["correct_answers"] or 0
            wrong = slot["wrong_answers"] or 0
            answered = correct + wrong
            accuracy = round(correct / answered * 100, 2) if answered > 0 else None
            rows.append({
                "mock_test_id": mock_id,
                "subject_id": sid,
                "total_questions": total,
                "correct_answers": correct,
                "wrong_answers": wrong,
                "marks": slot["marks"] or None,
                "accuracy": accuracy,
            })

        if not rows:
            return {"outcome": "no_change", "breakdowns_before": before_count, "breakdowns_after": before_count, "reason": "no_resolvable_subjects"}

        # Replace existing rows. Best-effort delete (some tables forbid
        # bulk delete on a non-PK column; if it fails we still insert
        # and the caller can clean up).
        _safe(
            lambda: supabase.table("mock_subject_breakdowns")
            .delete()
            .eq("mock_test_id", mock_id)
            .execute()
        )
        inserted = _safe(
            lambda: supabase.table("mock_subject_breakdowns").insert(rows).execute(),
            default=None,
        )
        after_data = getattr(inserted, "data", None) or []
        return {
            "outcome": "ok",
            "breakdowns_before": before_count,
            "breakdowns_after": len(after_data) or len(rows),
            "rows": after_data or rows,
        }
    except Exception as exc:  # noqa: BLE001
        return {"outcome": "error", "error": str(exc)[:300], "breakdowns_before": None, "breakdowns_after": None}
