"""Tests for snapshot persistence + safe defaults when sources are missing."""
from __future__ import annotations

from datetime import datetime, timezone

from app.persona import PERSONA_VERSION
from app.persona.signals import collect_user_signals
from app.persona.snapshots import (
    build_snapshot_payload,
    compute_persona_snapshot,
    get_latest_persona_snapshot,
    save_persona_snapshot,
)


class _Exec:
    def __init__(self, data):
        self.data = data


class _Query:
    """Tiny in-memory stand-in for the Supabase query builder."""

    def __init__(self, name, db):
        self.name = name
        self.db = db
        self.filters = {}
        self._order = None
        self._desc = False
        self._limit = None

    def select(self, *a, **k):
        return self

    def eq(self, key, val):
        self.filters[key] = val
        return self

    def gte(self, *a, **k):
        return self

    def order(self, key, desc=False):
        self._order = key
        self._desc = desc
        return self

    def limit(self, n):
        self._limit = n
        return self

    def insert(self, payload):
        self._pending_insert = payload
        return self

    def update(self, patch):
        self._pending_update = patch
        return self

    def execute(self):
        if hasattr(self, "_pending_insert"):
            row = dict(self._pending_insert)
            row.setdefault("id", f"row-{len(self.db.get(self.name, [])) + 1}")
            self.db.setdefault(self.name, []).append(row)
            return _Exec([row])
        rows = list(self.db.get(self.name, []))
        for k, v in self.filters.items():
            rows = [r for r in rows if r.get(k) == v]
        if self._order:
            rows.sort(key=lambda r: r.get(self._order) or "", reverse=self._desc)
        if self._limit is not None:
            rows = rows[: self._limit]
        return _Exec(rows)


class _SB:
    def __init__(self, db=None):
        self.db = db or {}

    def table(self, name):
        return _Query(name, self.db)


# ─── build_snapshot_payload ────────────────────────────────────────────────
def test_build_snapshot_payload_shape_and_version():
    signals = {"goal_exams_count": 1, "weekly_hours_goal": 14}
    payload = build_snapshot_payload("user-1", signals)
    assert payload["user_id"] == "user-1"
    assert payload["persona_version"] == PERSONA_VERSION
    assert "primary_persona" in payload
    assert "dimensions" in payload and isinstance(payload["dimensions"], dict)
    assert "scores" in payload and isinstance(payload["scores"], dict)
    assert "evidence" in payload and isinstance(payload["evidence"], list)
    assert "study_policy" in payload and isinstance(payload["study_policy"], dict)
    assert payload["source_hash"]
    # source_hash deterministic: same signals -> same hash.
    second = build_snapshot_payload("user-1", signals)
    assert second["source_hash"] == payload["source_hash"]


def test_save_snapshot_inserts_and_latest_retrieves_most_recent():
    sb = _SB({"aspirant_persona_snapshots": []})
    older = build_snapshot_payload("u1", {"goal_exams_count": 0})
    older["computed_at"] = datetime(2024, 1, 1, tzinfo=timezone.utc).isoformat()
    save_persona_snapshot(sb, older)

    newer = build_snapshot_payload("u1", {"goal_exams_count": 2})
    newer["computed_at"] = datetime(2025, 5, 1, tzinfo=timezone.utc).isoformat()
    save_persona_snapshot(sb, newer)

    latest = get_latest_persona_snapshot(sb, "u1")
    assert latest is not None
    assert latest["computed_at"] == newer["computed_at"]


def test_get_latest_returns_none_when_no_snapshot():
    sb = _SB({"aspirant_persona_snapshots": []})
    assert get_latest_persona_snapshot(sb, "u-missing") is None


def test_get_latest_returns_none_for_empty_or_placeholder_user_id():
    # Even if a row happens to exist, the placeholder lookups must short-circuit
    # before issuing a Supabase query (verified by the sentinel `_BoomSB` that
    # raises on any table access).
    class _BoomSB:
        def table(self, name):  # noqa: D401
            raise AssertionError(f"table({name}) called for placeholder user_id")

    sb = _BoomSB()
    for placeholder in (None, "", "None", "undefined", "null", "  ", " None "):
        assert get_latest_persona_snapshot(sb, placeholder) is None


# ─── safe defaults when optional sources are missing ───────────────────────
def test_collect_signals_safe_when_tables_missing():
    class _BrokenSB:
        def table(self, name):
            raise RuntimeError(f"{name} not deployed")

    signals = collect_user_signals(_BrokenSB(), "u-x")
    assert signals["profile_completeness"] == 0.0
    assert signals["goal_exams_count"] == 0
    assert signals["weekly_hours_goal"] is None
    assert signals["task_completion_rate_14d"] is None
    assert signals["missed_task_count_14d"] == 0
    assert signals["focus_minutes_7d"] == 0
    assert signals["mocks_taken_30d"] == 0
    assert signals["weekly_review_available"] is False


def test_compute_persona_snapshot_end_to_end_with_empty_db():
    sb = _SB({"aspirant_persona_snapshots": [], "profiles": []})
    saved = compute_persona_snapshot(sb, "u-1", reason="test")
    assert saved["user_id"] == "u-1"
    assert saved["persona_version"] == PERSONA_VERSION
    # A meta evidence entry must be appended with the compute reason.
    meta = [e for e in saved["evidence"] if e.get("dimension") == "_meta"]
    assert meta and meta[0]["reason"] == "test"
    # And the row should now be in the in-memory db.
    assert len(sb.db["aspirant_persona_snapshots"]) == 1


def test_save_persona_snapshot_requires_user_id():
    sb = _SB({"aspirant_persona_snapshots": []})
    try:
        save_persona_snapshot(sb, {"persona_version": "v1"})
    except ValueError:
        return
    raise AssertionError("save_persona_snapshot should reject snapshots without user_id")
