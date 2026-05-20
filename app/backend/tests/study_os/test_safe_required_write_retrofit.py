"""Write-path retrofit: Study OS mock + mastery writes use safe_required.

These pin the fail-surfacing behaviour the retrofit standardises:
  * a failed critical write surfaces (raise / None) instead of silently
    reporting success;
  * mastery's returned summary counts only writes that actually landed.

Most existing write sites already used the defensive
``_safe(default=None) + .data check`` idiom; this routes them through the
single audited ``safe_required`` helper so the failure is op-tagged and
the success count is honest.
"""
from __future__ import annotations

import pytest

from app.study_os.mastery import recompute_topic_mastery
from app.study_os.mocks import create_mock
from tests.persona_questions._stub import SBStub


class _WriteFailsStub(SBStub):
    """SBStub whose inserts/updates on a chosen table return empty data."""

    def __init__(self, db=None, *, fail_table: str | None = None):
        super().__init__(db)
        self._fail_table = fail_table

    def table(self, name):
        q = super().table(name)
        if name == self._fail_table:
            original_execute = q.execute

            class _Empty:
                data: list = []

            def _exec():
                # Selects pass through (so existence checks work); only the
                # mutating execute returns empty to simulate a failed write.
                if q._pending_insert is not None or q._pending_update is not None or getattr(q, "_pending_upsert", None) is not None:
                    return _Empty()
                return original_execute()

            q.execute = _exec  # type: ignore[assignment]
        return q


# ── mocks.create_mock ──────────────────────────────────────────────────


def test_create_mock_raises_when_insert_returns_no_row():
    sb = _WriteFailsStub({"mock_tests": []}, fail_table="mock_tests")
    with pytest.raises(RuntimeError):
        create_mock(sb, "u-1", {"name": "M", "score": 10, "max_score": 20})


def test_create_mock_succeeds_on_normal_stub():
    sb = SBStub({})
    out = create_mock(sb, "u-1", {"name": "M", "score": 10, "max_score": 20})
    assert out["id"]
    assert sb.db["mock_tests"]


# ── mastery.recompute_topic_mastery honest counts ──────────────────────


def _mastery_seed() -> dict:
    return {
        "mock_tests": [
            {"id": "m1", "user_id": "u-1", "exam_id": "e1", "exam_phase_id": "p1", "attempted_at": "2026-05-01T00:00:00+00:00"},
        ],
        "mock_topic_breakdowns": [
            {"mock_test_id": "m1", "topic_id": "t1", "subject_id": "s1", "correct_answers": 5, "wrong_answers": 5, "error_types": {"concept_gap": 2}},
        ],
    }


def test_recompute_counts_successful_writes():
    sb = SBStub(_mastery_seed())
    out = recompute_topic_mastery(sb, "u-1")
    assert out["mastery_rows"] == 1
    assert out["error_pattern_rows"] == 1
    assert any(m.get("topic_id") == "t1" for m in sb.db.get("user_topic_mastery", []))


def test_recompute_does_not_overcount_when_mastery_write_fails():
    sb = _WriteFailsStub(_mastery_seed(), fail_table="user_topic_mastery")
    out = recompute_topic_mastery(sb, "u-1")
    # The mastery write was forced to fail → it must NOT be counted as landed.
    assert out["mastery_rows"] == 0
    # No mastery row actually persisted.
    assert not sb.db.get("user_topic_mastery", [])
