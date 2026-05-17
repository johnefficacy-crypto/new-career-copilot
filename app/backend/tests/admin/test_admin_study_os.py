"""Tests for admin Study OS Phase 1 — Inspector + Plan Ops."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import admin_study_os as api
from app.core.auth import get_current_user
from app.core import config as core_config
from tests.persona_questions._stub import SBStub, _Exec, _Query


# ─── Extended stub that supports the extras admin_study_os needs ──────────


class _ExtendedQuery(_Query):
    """Adds ilike, range, not_.in_, and count='exact' on top of the base stub.

    The persona-test stub deliberately keeps the surface tight; admin_study_os
    uses a few extra Supabase features (text search via ilike, pagination
    via range, count="exact" returns, and negative IN for the adaptation-
    events 'engine' filter). Implementing those here keeps the unit tests
    self-contained without polluting the shared stub.
    """

    def __init__(self, name, db):
        super().__init__(name, db)
        self._count_mode: str | None = None
        self._range: tuple[int, int] | None = None
        self._not_filters: list[tuple[str, str, Any]] = []
        self.not_ = self  # so q.not_.in_(...) returns self
        self._select_count: str | None = None

    def select(self, *args, **kwargs):
        # accept count="exact" / count=None
        if "count" in kwargs:
            self._count_mode = kwargs["count"]
        return self

    def ilike(self, key, pattern):
        # Convert SQL ILIKE pattern to Python lower contains for "%x%".
        needle = pattern.lower().strip("%")
        self.filters.append((key, "ilike", needle))
        return self

    def in_(self, key, vals):
        return super().in_(key, vals)

    def range(self, lo, hi):
        self._range = (lo, hi)
        return self

    def _matches(self, row):
        for key, op, val in self.filters:
            cell = row.get(key)
            if op == "ilike":
                if not (isinstance(cell, str) and val in cell.lower()):
                    return False
                continue
            if op == "eq" and cell != val:
                return False
            if op == "neq" and cell == val:
                return False
            if op == "is":
                # Supabase serializes IS NULL as .is_("col", "null"); accept both.
                expect_none = val is None or val == "null"
                if expect_none and cell is not None:
                    return False
                if not expect_none and cell != val:
                    return False
                continue
            if op == "gte" and not (cell is not None and cell >= val):
                return False
            if op == "lte" and not (cell is not None and cell <= val):
                return False
            if op == "in" and cell not in val:
                return False
        for key, op, val in self._not_filters:
            cell = row.get(key)
            if op == "in" and cell in val:
                return False
        return True

    def execute(self):
        res = super().execute()
        if self._count_mode == "exact":
            res.count = len(res.data)
        if self._range:
            lo, hi = self._range
            res.data = res.data[lo : hi + 1]
        return res


class _NotProxy:
    def __init__(self, q: _ExtendedQuery):
        self._q = q

    def in_(self, key, vals):
        self._q._not_filters.append((key, "in", list(vals)))
        return self._q


class ExtSBStub(SBStub):
    def table(self, name: str):
        q = _ExtendedQuery(name, self.db)
        q.not_ = _NotProxy(q)
        return q


# ─── App factory ──────────────────────────────────────────────────────────


def _app(sb: ExtSBStub, *, role: str = "super_admin", flag: bool = True) -> FastAPI:
    app = FastAPI()
    app.include_router(api.router, prefix="/api")
    api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    core_config.get_settings.cache_clear()
    # Patch the flag for this app
    settings = core_config.get_settings()
    settings.ADMIN_STUDY_OS_ENABLED = flag
    app.dependency_overrides[get_current_user] = lambda: {
        "id": "admin-1",
        "email": "admin@example.com",
        "role": role,
        "permissions": [],
    }
    return app


def _seed_minimal_user() -> ExtSBStub:
    now = datetime.now(timezone.utc).isoformat()
    sb = ExtSBStub(
        {
            "profiles": [
                {
                    "id": "user-1",
                    "email": "u@example.com",
                    "full_name": "User One",
                    "timezone": "Asia/Kolkata",
                    "onboarding_completed": True,
                    "created_at": now,
                    "last_seen_at": now,
                }
            ],
            "study_plans": [
                {
                    "id": "plan-1",
                    "user_id": "user-1",
                    "status": "active",
                    "theme": "phase-a",
                    "target": "exam-x",
                    "start_date": "2026-04-01",
                    "end_date": "2026-07-01",
                    "current_plan_version_id": "v-1",
                    "active_phase_id": "phase-1",
                    "updated_at": now,
                    "created_at": now,
                }
            ],
            "study_plan_versions": [
                {
                    "id": "v-1",
                    "plan_id": "plan-1",
                    "version_number": 1,
                    "change_summary": {},
                    "created_at": now,
                }
            ],
            "study_tasks": [
                {
                    "id": "t-1",
                    "user_id": "user-1",
                    "plan_id": "plan-1",
                    "status": "planned",
                    "task_type": "concept_learning",
                    "scheduled_date": datetime.now(timezone.utc).date().isoformat(),
                    "duration_mins": 30,
                },
                {
                    "id": "t-2",
                    "user_id": "user-1",
                    "plan_id": "plan-1",
                    "status": "carried_forward",
                    "scheduled_date": datetime.now(timezone.utc).date().isoformat(),
                },
            ],
            "study_sessions": [
                {
                    "id": "sess-1",
                    "user_id": "user-1",
                    "session_type": "focus",
                    "started_at": (datetime.now(timezone.utc) - timedelta(hours=8)).isoformat(),
                    "ended_at": None,
                    "duration_mins": 25,
                    "notes": None,
                }
            ],
            "study_adaptation_events": [
                {
                    "id": "ev-1",
                    "user_id": "user-1",
                    "plan_id": "plan-1",
                    "event_type": "initial_generation",
                    "trigger_source": "planner_v1",
                    "change_summary": {"task_count": 4},
                    "created_at": now,
                }
            ],
            "admin_audit_logs": [],
            "user_notes": [],
            "flashcards": [],
            "mistake_entries": [],
            "revision_schedule": [],
            "saved_recruitments": [],
            "user_recruitment_applications": [],
            "mock_results": [],
            "flashcard_decks": [],
            "weekly_reviews": [],
            "study_report_cards": [],
        }
    )
    return sb


# ─── Tests ────────────────────────────────────────────────────────────────


def test_flag_off_returns_404_on_every_endpoint():
    sb = _seed_minimal_user()
    app = _app(sb, flag=False)
    client = TestClient(app)
    for path in [
        "/api/admin/study-os/users/search?q=user",
        "/api/admin/study-os/users/user-1/snapshot",
        "/api/admin/study-os/users/user-1/mission-control",
        "/api/admin/study-os/users/user-1/adaptation-events",
    ]:
        assert client.get(path).status_code == 404, path
    body = {"reason": "needs investigation step"}
    for path in [
        "/api/admin/study-os/users/user-1/plan-ops/preview-draft",
        "/api/admin/study-os/users/user-1/plan-ops/apply",
        "/api/admin/study-os/users/user-1/plan-ops/reset-carry-forward",
        "/api/admin/study-os/users/user-1/focus/force-close",
    ]:
        assert client.post(path, json=body).status_code == 404, path


def test_search_finds_by_email_substring():
    sb = _seed_minimal_user()
    app = _app(sb)
    r = TestClient(app).get("/api/admin/study-os/users/search?q=u@exam")
    assert r.status_code == 200
    assert any(it["id"] == "user-1" for it in r.json()["items"])


def test_snapshot_returns_active_plan_focus_and_counts():
    sb = _seed_minimal_user()
    app = _app(sb)
    r = TestClient(app).get("/api/admin/study-os/users/user-1/snapshot")
    assert r.status_code == 200
    s = r.json()
    assert s["profile"]["id"] == "user-1"
    assert s["plan"]["active"]["id"] == "plan-1"
    assert s["plan"]["latest_version"]["version_number"] == 1
    assert s["plan"]["today_total"] == 2
    assert s["focus"]["active_session"]["id"] == "sess-1"
    # 8 hours > 6 hour threshold → stuck flag set
    assert s["focus"]["active_session_stuck"] is True
    assert "notes" in s["artifacts"]


def test_snapshot_404_for_unknown_user():
    sb = _seed_minimal_user()
    app = _app(sb)
    r = TestClient(app).get("/api/admin/study-os/users/nope/snapshot")
    assert r.status_code == 404


def test_adaptation_events_returns_rows():
    sb = _seed_minimal_user()
    app = _app(sb)
    r = TestClient(app).get("/api/admin/study-os/users/user-1/adaptation-events?limit=5")
    assert r.status_code == 200
    assert r.json()["items"][0]["id"] == "ev-1"


def test_skip_task_marks_planned_task_skipped_and_audits():
    sb = _seed_minimal_user()
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/study-os/users/user-1/plan-ops/skip-task",
        json={"reason": "user reported stuck task", "payload": {"task_id": "t-1"}},
    )
    assert r.status_code == 200, r.text
    # Task status flipped
    assert next(t for t in sb.db["study_tasks"] if t["id"] == "t-1")["status"] == "skipped"
    # Audit row written
    audits = sb.db["admin_audit_logs"]
    assert any(a["action"] == "study_os.plan_ops.skip_task" for a in audits)
    # Adaptation event emitted with trigger_source='admin'
    evs = sb.db["study_adaptation_events"]
    assert any(
        e.get("trigger_source") == "admin" and e.get("event_type") == "admin_skip_task"
        for e in evs
    )


def test_skip_task_rejects_already_terminal_status():
    sb = _seed_minimal_user()
    # Pre-flip task to completed
    sb.db["study_tasks"][0]["status"] = "completed"
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/study-os/users/user-1/plan-ops/skip-task",
        json={"reason": "trying to override", "payload": {"task_id": "t-1"}},
    )
    assert r.status_code == 409


def test_skip_task_rejects_wrong_owner():
    sb = _seed_minimal_user()
    sb.db["study_tasks"][0]["user_id"] = "user-2"
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/study-os/users/user-1/plan-ops/skip-task",
        json={"reason": "wrong owner check", "payload": {"task_id": "t-1"}},
    )
    assert r.status_code == 409


def test_reset_carry_forward_skips_all_and_audits():
    sb = _seed_minimal_user()
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/study-os/users/user-1/plan-ops/reset-carry-forward",
        json={"reason": "carry-forward avalanche cleanup"},
    )
    assert r.status_code == 200
    assert r.json()["cleared"] == 1
    assert next(t for t in sb.db["study_tasks"] if t["id"] == "t-2")["status"] == "skipped"
    assert any(
        a["action"] == "study_os.plan_ops.reset_carry_forward"
        for a in sb.db["admin_audit_logs"]
    )


def test_focus_force_close_sets_ended_at_and_marks_notes():
    sb = _seed_minimal_user()
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/study-os/users/user-1/focus/force-close",
        json={"reason": "session stuck overnight"},
    )
    assert r.status_code == 200
    sess = next(s for s in sb.db["study_sessions"] if s["id"] == "sess-1")
    assert sess["ended_at"] is not None
    assert "[admin:admin@example.com]" in (sess["notes"] or "")


def test_focus_force_close_404_when_no_open_session():
    sb = _seed_minimal_user()
    sb.db["study_sessions"][0]["ended_at"] = datetime.now(timezone.utc).isoformat()
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/study-os/users/user-1/focus/force-close",
        json={"reason": "trying to close nothing"},
    )
    assert r.status_code == 404


def test_write_body_rejects_short_reason():
    sb = _seed_minimal_user()
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/study-os/users/user-1/plan-ops/reset-carry-forward",
        json={"reason": "short"},
    )
    assert r.status_code == 422


def test_apply_calls_planner_and_emits_admin_event(monkeypatch):
    sb = _seed_minimal_user()
    app = _app(sb)
    called = {}

    def fake_apply(supabase, user_id, *, reason, event_type):
        called.update(
            {"user_id": user_id, "reason": reason, "event_type": event_type}
        )
        return {
            "generated": True,
            "applied": True,
            "plan_id": "plan-1",
            "plan_version_id": "v-2",
            "version_number": 2,
            "task_count": 4,
            "risk_level": "low",
        }

    monkeypatch.setattr(api, "apply_plan", fake_apply)
    r = TestClient(app).post(
        "/api/admin/study-os/users/user-1/plan-ops/apply",
        json={"reason": "user stuck on plan, regenerating"},
    )
    assert r.status_code == 200, r.text
    assert called["reason"] == "admin_apply"
    assert called["event_type"] == "admin_apply"
    # Admin-attributed adaptation event added in addition to whatever the
    # planner itself wrote.
    assert any(
        e.get("trigger_source") == "admin" and e.get("event_type") == "admin_apply"
        for e in sb.db["study_adaptation_events"]
    )


def test_preview_draft_calls_compute_draft(monkeypatch):
    sb = _seed_minimal_user()
    app = _app(sb)
    monkeypatch.setattr(
        api,
        "compute_draft_plan",
        lambda supabase, user_id: {"generated": True, "task_count": 4, "risk_level": "low"},
    )
    r = TestClient(app).post(
        "/api/admin/study-os/users/user-1/plan-ops/preview-draft",
        json={"reason": "diff inspection before apply"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["draft"]["generated"] is True
    assert any(
        a["action"] == "study_os.plan_ops.preview_draft"
        for a in sb.db["admin_audit_logs"]
    )
