"""Planner persistence — fail-closed contract.

The planner used to wrap every write in a bare ``_safe(...)``: a constraint
violation (e.g. ``event_type`` not in CHECK), a transient network blip, or
a 42703 schema-drift were all returned as ``{generated: True}``. This
suite pins the new contract: ``apply_plan`` must surface a structured
``reason`` whenever any of the five critical writes fails to land.
"""
from __future__ import annotations

from typing import Any

from tests.persona_questions._stub import SBStub
from tests.study_os.test_planner import _seed

from app.study_os.planner import apply_plan


# ── happy path ─────────────────────────────────────────────────────────


def test_apply_succeeds_with_no_reason_field():
    sb = SBStub(_seed())
    out = apply_plan(sb, "u-1")
    assert out["generated"] is True
    assert out["applied"] is True
    assert "reason" not in out
    # every critical row landed
    assert len(sb.db["study_plans"]) == 1
    assert len(sb.db["study_plan_versions"]) == 1
    assert len(sb.db["study_tasks"]) >= 1
    assert len(sb.db["study_adaptation_events"]) == 1


# ── enum fix ───────────────────────────────────────────────────────────


def test_apply_writes_audit_with_manual_regeneration_event_type():
    """The default ``event_type`` must be a value present in the
    ``study_adaptation_events.event_type`` CHECK constraint (migration 033).
    """
    sb = SBStub(_seed())
    out = apply_plan(sb, "u-1")
    assert out["applied"] is True
    events = sb.db["study_adaptation_events"]
    assert len(events) == 1
    assert events[0]["event_type"] == "manual_regeneration"


def test_manual_application_never_appears_in_any_payload():
    """Regression guard. The legacy default leaked into every audit
    insert and was being silently rejected by Postgres; pin that the
    string can never appear in a persisted row again.
    """
    sb = SBStub(_seed())
    apply_plan(sb, "u-1")
    for table in ("study_plans", "study_plan_versions", "study_tasks", "study_adaptation_events"):
        for row in sb.db.get(table, []):
            for value in row.values():
                if isinstance(value, str):
                    assert "manual_application" not in value, (
                        f"Stale event_type leaked into {table}: {row}"
                    )


# ── fail-closed paths ──────────────────────────────────────────────────


def _failing_sb(failing_op: str, base_seed: dict[str, Any] | None = None) -> SBStub:
    """An SBStub that returns an empty-data response for one write op.

    ``failing_op`` is matched against ``"<table>.<operation>"``. Anything
    else passes through to the normal stub behaviour.
    """
    sb = SBStub(base_seed if base_seed is not None else _seed())

    original_table = sb.table

    class _FailingQuery:
        def __init__(self, inner, table_name):
            self._inner = inner
            self._table = table_name
            self._op: str | None = None

        def __getattr__(self, name):
            attr = getattr(self._inner, name)
            if name in {"insert", "update", "upsert", "delete"}:
                # tag the op as the first mutating verb we see on this
                # query chain
                if self._op is None:
                    self._op = name

                def _wrap(*a, **kw):
                    self._inner = attr(*a, **kw)
                    return self

                return _wrap
            if name == "execute":

                def _exec():
                    op_label = f"{self._table}.{self._op or 'select'}"
                    if op_label == failing_op:
                        return _Empty()
                    return attr()

                return _exec

            def _passthrough(*a, **kw):
                self._inner = attr(*a, **kw)
                return self

            return _passthrough

    class _Empty:
        data: list = []

    def _table(name: str):
        return _FailingQuery(original_table(name), name)

    sb.table = _table  # type: ignore[assignment]
    return sb


def test_apply_fail_closed_when_study_plans_insert_returns_empty():
    sb = _failing_sb("study_plans.insert")
    out = apply_plan(sb, "u-1")
    assert out["generated"] is False
    assert out["reason"] == "plan_persist_failed"


def test_apply_fail_closed_when_version_insert_returns_empty():
    sb = _failing_sb("study_plan_versions.insert")
    out = apply_plan(sb, "u-1")
    assert out["generated"] is False
    assert out["reason"] == "version_persist_failed"


def test_apply_fail_closed_when_task_insert_returns_empty():
    sb = _failing_sb("study_tasks.insert")
    out = apply_plan(sb, "u-1")
    assert out["generated"] is False
    assert out["reason"] == "task_persist_failed"


def test_apply_fail_closed_when_adaptation_insert_returns_empty():
    sb = _failing_sb("study_adaptation_events.insert")
    out = apply_plan(sb, "u-1")
    assert out["generated"] is False
    assert out["reason"] == "audit_persist_failed"


def test_apply_tolerates_empty_delete_on_fresh_plan():
    """The today's-task delete legitimately matches zero rows on the very
    first apply — ``allow_empty=True`` keeps that from being a failure.
    """
    sb = SBStub(_seed())
    out = apply_plan(sb, "u-1")
    assert out["generated"] is True
    assert out["applied"] is True
    assert "reason" not in out
