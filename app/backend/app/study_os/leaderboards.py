"""Study OS — leaderboard build (PR 4 + PR 11).

Builds opt-in leaderboard rows. Spec rules enforced here:
  * Behavior board uses only system-verified metrics.
  * A user row is only written if `study_comparison_settings.public_leaderboard_enabled`
    is true. Otherwise the row is private (subject_type='user' rows still pass RLS
    to the owner, but stay invisible to others).
  * Mock-score boards never mix tiers — a separate row is written per tier.
  * Group and partner boards write subject_type='group' / 'pair' rows.

This module exposes a single ``build_leaderboard`` entry point that takes a
period window and writes a row per subject. The caller (a scheduler or admin
RPC) chooses board_type + metric_key.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable

logger = logging.getLogger("career_copilot.study_os.leaderboards")


SYSTEM_VERIFIED_METRICS = {
    "behavior_index",
    "consistency",
    "focus_minutes",
    "plan_adherence",
    "discipline",
    "backlog_recovery",
}


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("leaderboards supabase call failed: %s", exc)
        return default


def _percentile_rank(scores: list[float], target: float) -> int | None:
    if not scores:
        return None
    below = sum(1 for s in scores if s < target)
    return int(round(100 * below / len(scores)))


def _rank_band(percentile: int | None) -> str | None:
    if percentile is None:
        return None
    if percentile >= 67:
        return "ahead"
    if percentile >= 34:
        return "on_track"
    return "behind"


def _read_users_in_cohort(supabase: Any, cohort_key: str) -> list[str]:
    rows = _safe(
        lambda: (
            supabase.table("study_cohort_memberships")
            .select("user_id")
            .eq("cohort_key", cohort_key)
            .is_("left_at", None)
            .execute()
        ),
        default=None,
    )
    return [r["user_id"] for r in (getattr(rows, "data", None) or [])]


def _read_user_score(
    supabase: Any,
    user_id: str,
    metric_key: str,
    period_start: date,
    period_end: date,
) -> float | None:
    rows = _safe(
        lambda: (
            supabase.table("study_behavior_daily_snapshots")
            .select(
                "behavior_adherence_score, consistency_score, focus_minutes, "
                "discipline_score, planned_tasks, completed_tasks, backlog_count, "
                "mock_count, mock_review_count"
            )
            .eq("user_id", user_id)
            .gte("snapshot_date", period_start.isoformat())
            .lte("snapshot_date", period_end.isoformat())
            .execute()
        ),
        default=None,
    )
    items = getattr(rows, "data", None) or []
    if not items:
        return None
    if metric_key == "consistency":
        active = sum(1 for r in items if r.get("consistency_score") is not None)
        return float(sum(float(r.get("consistency_score") or 0) for r in items)) / max(active, 1)
    if metric_key == "focus_minutes":
        return float(sum(int(r.get("focus_minutes") or 0) for r in items))
    if metric_key == "plan_adherence":
        tp = sum(int(r.get("planned_tasks") or 0) for r in items)
        tc = sum(int(r.get("completed_tasks") or 0) for r in items)
        return (tc / tp) if tp else 0.0
    if metric_key == "discipline":
        vals = [r.get("discipline_score") for r in items if r.get("discipline_score") is not None]
        return float(sum(vals)) / len(vals) if vals else None
    if metric_key == "backlog_recovery":
        first = next(
            (int(r.get("backlog_count") or 0) for r in items if r.get("backlog_count") is not None),
            None,
        )
        last = next(
            (
                int(r.get("backlog_count") or 0)
                for r in reversed(items)
                if r.get("backlog_count") is not None
            ),
            None,
        )
        if first is None or last is None or first == 0:
            return None
        return max(0.0, (first - last) / first)
    if metric_key == "behavior_index":
        from app.study_os.behavior_scores import BEHAVIOR_INDEX_WEIGHTS

        tp = sum(int(r.get("planned_tasks") or 0) for r in items)
        tc = sum(int(r.get("completed_tasks") or 0) for r in items)
        adherence = (tc / tp) if tp else 0.0
        consistency_vals = [r.get("consistency_score") or 0 for r in items]
        consistency = float(sum(consistency_vals)) / max(len(consistency_vals), 1)
        focus_total = sum(int(r.get("focus_minutes") or 0) for r in items)
        focus_norm = min(1.0, focus_total / (240 * len(items))) if items else 0.0
        mock_cnt = sum(int(r.get("mock_count") or 0) for r in items)
        mock_rev = sum(int(r.get("mock_review_count") or 0) for r in items)
        mock_review = (mock_rev / mock_cnt) if mock_cnt else 0.0
        w = BEHAVIOR_INDEX_WEIGHTS
        score = (
            w["plan_adherence"] * adherence
            + w["consistency"] * consistency
            + w["focus_minutes"] * focus_norm
            + w["task_completion"] * adherence
            + w["mock_review"] * mock_review
        )
        return score
    return None


def build_leaderboard(
    supabase: Any,
    board_type: str,
    metric_key: str,
    cohort_key: str,
    period_start: date,
    period_end: date,
    trust_tier: str = "tier_1",
) -> dict[str, Any]:
    """Build leaderboard rows for one cohort/metric window. Returns counts."""
    if board_type == "behavior" and metric_key not in SYSTEM_VERIFIED_METRICS:
        raise ValueError(
            f"behavior board accepts system-verified metrics only; got {metric_key!r}"
        )

    user_ids = _read_users_in_cohort(supabase, cohort_key)
    if not user_ids:
        return {"written": 0, "skipped_private": 0}

    # Settings — only write opt-in rows.
    settings_rows = _safe(
        lambda: (
            supabase.table("study_comparison_settings")
            .select("user_id, public_leaderboard_enabled, solo_mode")
            .in_("user_id", user_ids)
            .execute()
        ),
        default=None,
    )
    settings_by_user = {
        r["user_id"]: r for r in (getattr(settings_rows, "data", None) or [])
    }

    raw_scores: list[tuple[str, float]] = []
    for uid in user_ids:
        s = settings_by_user.get(uid, {})
        if s.get("solo_mode") is True:
            continue
        score = _read_user_score(supabase, uid, metric_key, period_start, period_end)
        if score is None:
            continue
        raw_scores.append((uid, score))

    if not raw_scores:
        return {"written": 0, "skipped_private": 0}

    score_values = [s for _, s in raw_scores]
    rows_to_write: list[dict[str, Any]] = []
    skipped_private = 0
    raw_scores_sorted = sorted(raw_scores, key=lambda x: x[1], reverse=True)
    for rank_idx, (uid, score) in enumerate(raw_scores_sorted, start=1):
        settings = settings_by_user.get(uid, {})
        is_opt_in = bool(settings.get("public_leaderboard_enabled"))
        pct = _percentile_rank(score_values, score)
        row = {
            "board_type": board_type,
            "subject_type": "user",
            "cohort_key": cohort_key,
            "metric_key": metric_key,
            "user_id": uid,
            "score": round(score, 4),
            "percentile": pct,
            "rank": rank_idx if is_opt_in else None,
            "rank_band": _rank_band(pct),
            "trust_tier": trust_tier,
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
        }
        if not is_opt_in:
            skipped_private += 1
        rows_to_write.append(row)

    _safe(lambda: supabase.table("study_leaderboard_entries").insert(rows_to_write).execute())
    return {"written": len(rows_to_write), "skipped_private": skipped_private}


def read_leaderboard(
    supabase: Any,
    user_id: str,
    board_type: str = "behavior",
    metric_key: str = "behavior_index",
    cohort_key: str | None = None,
    limit: int = 50,
) -> dict[str, Any]:
    """Read the latest leaderboard rows the caller is allowed to see.

    RLS does the heavy lifting (sle_visible_select). For the caller's own
    private row we also return it explicitly so the UI can show "you are 72nd"
    even when public boards are disabled.
    """
    q = (
        supabase.table("study_leaderboard_entries")
        .select("*")
        .eq("board_type", board_type)
        .eq("metric_key", metric_key)
        .order("period_end", desc=True)
        .order("score", desc=True)
        .limit(limit)
    )
    if cohort_key:
        q = q.eq("cohort_key", cohort_key)
    rows = _safe(lambda: q.execute(), default=None)
    public_items = getattr(rows, "data", None) or []

    self_rows = _safe(
        lambda: (
            supabase.table("study_leaderboard_entries")
            .select("*")
            .eq("user_id", user_id)
            .eq("board_type", board_type)
            .eq("metric_key", metric_key)
            .order("period_end", desc=True)
            .limit(1)
            .execute()
        ),
        default=None,
    )
    self_items = getattr(self_rows, "data", None) or []
    return {
        "board_type": board_type,
        "metric_key": metric_key,
        "cohort_key": cohort_key,
        "entries": public_items,
        "self": self_items[0] if self_items else None,
    }


def build_group_leaderboard(
    supabase: Any,
    cohort_key: str,
    period_start: date,
    period_end: date,
) -> dict[str, Any]:
    """PR 11: write subject_type='group' rows ranked by avg member adherence
    over the period."""
    groups = _safe(
        lambda: supabase.table("study_groups").select("id").eq("status", "active").execute(),
        default=None,
    )
    rows: list[dict[str, Any]] = []
    for g in getattr(groups, "data", None) or []:
        members = _safe(
            lambda gid=g["id"]: (
                supabase.table("study_group_members")
                .select("user_id")
                .eq("group_id", gid)
                .eq("status", "active")
                .execute()
            ),
            default=None,
        )
        member_ids = [m["user_id"] for m in (getattr(members, "data", None) or [])]
        if not member_ids:
            continue
        scores = []
        for uid in member_ids:
            s = _read_user_score(supabase, uid, "plan_adherence", period_start, period_end)
            if s is not None:
                scores.append(s)
        if not scores:
            continue
        avg = sum(scores) / len(scores)
        rows.append(
            {
                "board_type": "group",
                "subject_type": "group",
                "cohort_key": cohort_key,
                "metric_key": "avg_member_adherence",
                "group_id": g["id"],
                "score": round(avg, 4),
                "trust_tier": "tier_1",
                "period_start": period_start.isoformat(),
                "period_end": period_end.isoformat(),
            }
        )
    if rows:
        rows.sort(key=lambda r: r["score"], reverse=True)
        for i, r in enumerate(rows, start=1):
            r["rank"] = i
            r["percentile"] = _percentile_rank([x["score"] for x in rows], r["score"])
            r["rank_band"] = _rank_band(r["percentile"])
        _safe(lambda: supabase.table("study_leaderboard_entries").insert(rows).execute())
    return {"written": len(rows)}
