"""PR — Bug 2 fix: schema-drift reads must not persist a zero snapshot.

Before this PR, `_read_session_minutes` / `_read_recent_active_days`
asked Supabase for `duration_minutes, duration_mins`. Migration 017
only defines `duration_mins`, so PostgREST raised 42703 / HTTP 400 and
fell through `_safe()` to `default=None`. That silently produced a
zero-valued behavior snapshot that the upsert path then persisted —
corrupting the user's Behavior Index history.

This file pins the two invariants that prevent the regression:
1. The PostgREST select string asks only for columns that exist.
2. A simulated 42703/400 read failure does NOT upsert. A genuine
   empty-result-with-HTTP-200 day still does.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.study_os import behavior_scores
from app.study_os.behavior_scores import (
    READ_FAILED,
    compute_behavior_snapshot,
    upsert_behavior_snapshot,
)

from ._stub import SBStub


USER = "user-read-fail"


def _session(day: date, minutes: int) -> dict:
    started = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=10)
    return {
        "user_id": USER,
        "duration_mins": minutes,
        "started_at": started.isoformat(),
    }


# ----------------------------------------------------------------------
# 1. Source-level invariant: the file must not reference the bad column.
# ----------------------------------------------------------------------


def test_source_does_not_select_nonexistent_duration_minutes():
    """`study_sessions.duration_minutes` does not exist (migration 017
    defines only `duration_mins`). Any PostgREST `.select(...)` that
    includes the bad name would fail the whole query (PostgREST returns
    no rows from a select that references a missing column). Pin the
    invariant by scanning every `.select(...)` argument in the source.
    """
    src = Path(behavior_scores.__file__).read_text(encoding="utf-8")
    import re

    # Capture the literal argument passed to `.select(...)` calls.
    selects = re.findall(r"\.select\(\s*\"([^\"]+)\"", src)
    assert selects, "expected at least one `.select(...)` call in behavior_scores.py"
    for s in selects:
        cols = [c.strip() for c in s.split(",")]
        assert "duration_minutes" not in cols, (
            f"behavior_scores.py select asks for duration_minutes: {s!r}. "
            "Schema (migration 017) defines only duration_mins."
        )


# ----------------------------------------------------------------------
# 2. Behavioral invariants: read-failure vs empty-result.
# ----------------------------------------------------------------------


class _FailingSB:
    """Supabase stub whose `study_sessions` table raises like PostgREST
    would on a missing column (42703 / 400). Other tables behave
    normally so we can prove the discriminator is per-read."""

    def __init__(self, backing: SBStub):
        self._backing = backing
        self.upserts: list[dict] = []

    def table(self, name):
        if name == "study_sessions":
            return _RaisingQuery()
        if name == "study_behavior_daily_snapshots":
            return _RecordingUpsert(self.upserts, self._backing.table(name))
        return self._backing.table(name)


class _RaisingQuery:
    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def gte(self, *_a, **_k):
        return self

    def lt(self, *_a, **_k):
        return self

    def execute(self):
        # Mirror the postgrest-py error shape: a plain Exception is
        # enough — `_safe()` only catches and logs.
        raise Exception("42703: column study_sessions.duration_minutes does not exist")


class _RecordingUpsert:
    def __init__(self, sink, inner):
        self._sink = sink
        self._inner = inner

    def upsert(self, payload, on_conflict=None, **_k):
        self._sink.append(dict(payload))
        return self._inner.upsert(payload, on_conflict=on_conflict)

    def select(self, *a, **k):
        return self._inner.select(*a, **k)

    def eq(self, *a, **k):
        return self._inner.eq(*a, **k)

    def gte(self, *a, **k):
        return self._inner.gte(*a, **k)

    def lte(self, *a, **k):
        return self._inner.lte(*a, **k)

    def order(self, *a, **k):
        return self._inner.order(*a, **k)

    def limit(self, *a, **k):
        return self._inner.limit(*a, **k)

    def execute(self):
        return self._inner.execute()


def _make_sb(*, sessions: list[dict]) -> SBStub:
    return SBStub(
        {
            "study_sessions": sessions,
            "study_tasks": [],
            "mock_tests": [],
            "mock_correction_tasks": [],
            "study_behavior_daily_snapshots": [],
        }
    )


def test_read_failure_flags_payload_and_skips_upsert():
    today = date(2026, 5, 15)
    sb = _FailingSB(_make_sb(sessions=[]))
    payload = upsert_behavior_snapshot(sb, USER, today)
    assert payload["_read_failed"] is True
    # `study_sessions` raised → snapshot must NOT be persisted.
    assert sb.upserts == []


def test_empty_result_with_http_200_still_upserts_zero_snapshot():
    """No sessions today is real, observed state — the daily snapshot
    must still be written with zeros so streaks / consistency series
    keep their date axis intact."""
    today = date(2026, 5, 15)
    backing = _make_sb(sessions=[])
    # Record upserts on the backing store directly.
    captured: list[dict] = []
    table = backing.table

    def _table(name):
        q = table(name)
        if name == "study_behavior_daily_snapshots":
            return _RecordingUpsert(captured, q)
        return q

    backing.table = _table  # type: ignore[assignment]
    payload = upsert_behavior_snapshot(backing, USER, today)
    assert payload["_read_failed"] is False
    assert payload["total_study_minutes"] == 0
    assert len(captured) == 1, "expected a single zero-snapshot upsert"
    assert captured[0]["total_study_minutes"] == 0


def test_compute_returns_read_failed_sentinel_propagation():
    """If `_read_session_minutes` returns READ_FAILED, the compute layer
    sets `_read_failed=True` even when other reads succeed."""
    today = date(2026, 5, 15)
    sb = _FailingSB(_make_sb(sessions=[_session(today, 60)]))
    snap = compute_behavior_snapshot(sb, USER, today)
    assert snap["_read_failed"] is True
    # Zero-valued totals (because the failing read fell back to []),
    # but the persistence layer should refuse to write these.
    assert snap["total_study_minutes"] == 0
