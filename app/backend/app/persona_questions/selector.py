"""Next-question selection for the tiny-question card.

Selection rules (v1, deterministic):

1. Skip questions the user has already answered (not skipped).
2. Skip questions the user has dismissed and whose dismissal has not yet
   expired.
3. Among the remaining active questions, prefer ones whose
   ``target_dimension`` is currently unknown / insufficient_data in the
   user's latest persona snapshot.
4. Within each priority tier, order by ``priority`` ascending (lower
   number = higher priority — matches the seeded values).
5. Return ``None`` when nothing is left to ask.

The selector also returns a short "reason" string and a small
``persona_context`` block so the frontend can show a one-line rationale
without exposing internal persona labels.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Callable

from app.persona.snapshots import get_latest_persona_snapshot
from app.persona_questions.bank import (
    latest_question_answers,
    list_active_questions,
    shape_question_for_api,
)

logger = logging.getLogger("career_copilot.persona_questions.selector")

# Dimension values that count as "we don't know yet" for prioritisation.
_UNKNOWN_DIMENSION_VALUES = {
    None,
    "",
    "unknown",
    "insufficient_data",
}


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("persona_questions.selector supabase call failed: %s", exc)
        return default


def _active_dismissals(supabase: Any, user_id: str) -> set[str]:
    rows = _safe(
        lambda: (
            supabase.table("persona_question_dismissals")
            .select("question_key, dismissed_until")
            .eq("user_id", user_id)
            .limit(500)
            .execute()
            .data
        ),
        default=[],
    ) or []
    now = datetime.now(timezone.utc)
    active: set[str] = set()
    for row in rows:
        until = row.get("dismissed_until")
        if not until:
            # Permanent dismissal until explicitly cleared.
            if row.get("question_key"):
                active.add(row["question_key"])
            continue
        try:
            if isinstance(until, str):
                # tolerate both "...Z" and "...+00:00"
                parsed = datetime.fromisoformat(until.replace("Z", "+00:00"))
            else:
                parsed = until
            if parsed > now and row.get("question_key"):
                active.add(row["question_key"])
        except Exception:  # noqa: BLE001
            if row.get("question_key"):
                active.add(row["question_key"])
    return active


def _unknown_dimensions(snapshot: dict[str, Any] | None) -> set[str]:
    if not snapshot:
        return set()
    dims = snapshot.get("dimensions") or {}
    return {k for k, v in dims.items() if v in _UNKNOWN_DIMENSION_VALUES}


def _confidence(snapshot: dict[str, Any] | None) -> float | None:
    """A very rough confidence proxy: share of known dimensions × completeness."""
    if not snapshot:
        return None
    dims = snapshot.get("dimensions") or {}
    if not dims:
        return None
    known = sum(1 for v in dims.values() if v not in _UNKNOWN_DIMENSION_VALUES)
    share = known / len(dims)
    completeness = (
        (snapshot.get("scores") or {}).get("profile_completeness")
        if isinstance(snapshot.get("scores"), dict)
        else None
    )
    if completeness is None:
        return round(share, 3)
    try:
        return round((share + float(completeness)) / 2.0, 3)
    except (TypeError, ValueError):
        return round(share, 3)


def _reason_for(question: dict[str, Any], unknown_dims: set[str]) -> str:
    target = question.get("target_dimension")
    if target and target in unknown_dims:
        return "Improves Study OS personalization"
    if target == "study_policy":
        return "Tunes your daily plan layout"
    return "Helps tailor your study plan"


def select_next_question(supabase: Any, user_id: str) -> dict[str, Any]:
    """Return ``{question, reason, persona_context}``; question may be None."""
    if not user_id:
        return {
            "question": None,
            "reason": "No progressive question available right now",
            "persona_context": {"unknown_dimensions": [], "confidence": None},
        }

    snapshot = _safe(lambda: get_latest_persona_snapshot(supabase, user_id), default=None)
    unknown_dims = _unknown_dimensions(snapshot)
    confidence = _confidence(snapshot)

    answered = latest_question_answers(supabase, user_id)
    # Treat any non-skipped answer as a real answer that disqualifies
    # the question. Skipped answers (skipped=True) don't disqualify the
    # question on their own — the dismissal table handles "not now".
    answered_keys = {k for k, row in answered.items() if not row.get("skipped")}

    dismissed = _active_dismissals(supabase, user_id)

    candidates: list[dict[str, Any]] = []
    for q in list_active_questions(supabase):
        key = q.get("question_key")
        if not key:
            continue
        if key in answered_keys or key in dismissed:
            continue
        candidates.append(q)

    if not candidates:
        return {
            "question": None,
            "reason": "No progressive question available right now",
            "persona_context": {
                "unknown_dimensions": sorted(unknown_dims),
                "confidence": confidence,
            },
        }

    def _sort_key(q: dict[str, Any]) -> tuple[int, int]:
        # Lower is better. Boost (=0) questions targeting an unknown dim.
        boost = 0 if (q.get("target_dimension") in unknown_dims) else 1
        try:
            priority = int(q.get("priority") or 100)
        except (TypeError, ValueError):
            priority = 100
        return (boost, priority)

    candidates.sort(key=_sort_key)
    chosen = candidates[0]
    return {
        "question": shape_question_for_api(chosen),
        "reason": _reason_for(chosen, unknown_dims),
        "persona_context": {
            "unknown_dimensions": sorted(unknown_dims),
            "confidence": confidence,
        },
    }
