"""Policy / Update Intelligence context for Study OS (read-only).

Reads ``exam_policy_updates`` (migration 056) and splits it into two
clearly-separated channels:

* ``official_updates`` — ``source_type='official'`` AND
  ``reviewer_status='verified'``. These are the only rows allowed to
  carry ``affects_*`` flags into the planner.
* ``needs_verification`` — every non-official discovery row (aggregator /
  research / opportunity) that has not been rejected. These are surfaced
  for awareness only; ``can_affect_plan`` is always ``False``.

No AI, no scraping. Returns a safe-empty shape when nothing exists.
"""
from __future__ import annotations

import logging
from typing import Any, Callable

logger = logging.getLogger("career_copilot.study_os.update_context")

_AFFECT_KEYS = (
    "affects_plan",
    "affects_deadline",
    "affects_eligibility",
    "affects_documents",
    "affects_syllabus",
    "affects_vacancy",
)


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("update_context read failed: %s", exc)
        return default


def empty_policy_update_context() -> dict[str, Any]:
    """Safe-empty shape — used when there is no target exam or no data."""
    return {
        "official_updates": [],
        "needs_verification": [],
        "affects_plan": False,
        "affects_deadline": False,
        "affects_eligibility": False,
        "affects_documents": False,
        "affects_syllabus": False,
        "affects_vacancy": False,
    }


def _official_payload(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "update_type": row.get("update_type"),
        "title": row.get("title"),
        "summary": row.get("summary"),
        "source_url": row.get("source_url"),
        "source_type": row.get("source_type"),
        "claim_status": row.get("claim_status"),
        "reviewer_status": row.get("reviewer_status"),
        "published_at": row.get("published_at"),
        "effective_from": row.get("effective_from"),
        "affects": {k: bool(row.get(k)) for k in _AFFECT_KEYS},
        "change_summary": row.get("change_summary") or {},
    }


def _discovery_payload(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "source_type": row.get("source_type"),
        "update_type": row.get("update_type"),
        "title": row.get("title"),
        "summary": row.get("summary"),
        "source_url": row.get("source_url"),
        "status": row.get("reviewer_status") or "pending",
        # Discovery rows never influence the plan — surfaced for awareness.
        "can_affect_plan": False,
    }


def policy_update_context(supabase: Any, exam_id: str | None) -> dict[str, Any]:
    """Return the ``policy_update_context`` block for ``exam_id``.

    Always returns a dict with the full key set — never raises.
    """
    if not exam_id:
        return empty_policy_update_context()

    rows = _safe(
        lambda: (
            supabase.table("exam_policy_updates")
            .select(
                "id, exam_id, update_type, title, summary, source_url, "
                "source_type, claim_status, reviewer_status, affects_plan, "
                "affects_deadline, affects_eligibility, affects_documents, "
                "affects_syllabus, affects_vacancy, change_summary, "
                "published_at, effective_from, created_at"
            )
            .eq("exam_id", exam_id)
            .limit(500)
            .execute()
            .data
        ),
        default=[],
    ) or []

    official: list[dict[str, Any]] = []
    needs_verification: list[dict[str, Any]] = []
    aggregate = {k: False for k in _AFFECT_KEYS}

    for row in rows:
        is_official = row.get("source_type") == "official"
        is_verified = row.get("reviewer_status") == "verified"
        if is_official and is_verified:
            official.append(_official_payload(row))
            for k in _AFFECT_KEYS:
                if row.get(k):
                    aggregate[k] = True
        elif not is_official and row.get("reviewer_status") != "rejected":
            needs_verification.append(_discovery_payload(row))
        # Pending official rows and rejected rows are intentionally dropped:
        # not yet trusted, or explicitly dismissed.

    official.sort(key=lambda r: str(r.get("published_at") or ""), reverse=True)
    needs_verification.sort(key=lambda r: str(r.get("id") or ""))

    return {
        "official_updates": official,
        "needs_verification": needs_verification,
        **aggregate,
    }
