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
            "personal_notes": [],
            "flashcards": [],
            "mistake_entries": [],
            "revision_items": [],
            "saved_recruitments": [],
            "user_recruitment_applications": [],
            "mock_tests": [],
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


# ════════════════════════════════════════════════════════════════════════
#  Phase 2 — Learning Artifact Admin tests
# ════════════════════════════════════════════════════════════════════════


def _seed_artifacts(sb: ExtSBStub) -> None:
    """Seed the Phase 2 tables on top of the minimal fixture."""
    now = datetime.now(timezone.utc).isoformat()
    sb.db.setdefault("personal_notes", []).extend(
        [
            {
                "id": "note-1",
                "user_id": "user-1",
                "title": "Reaction kinetics",
                "tags": ["chem"],
                "exam_slug": "exam-x",
                "is_pinned": True,
                "is_archived": False,
                "created_at": now,
                "updated_at": now,
            },
            {
                "id": "note-2",
                "user_id": "user-1",
                "title": "(archived)",
                "tags": [],
                "is_archived": True,
                "created_at": now,
                "updated_at": now,
            },
            {
                "id": "note-3",
                "user_id": "user-other",
                "title": "should not appear",
                "is_archived": False,
                "created_at": now,
                "updated_at": now,
            },
        ]
    )
    sb.db.setdefault("flashcard_decks", []).append(
        {
            "id": "deck-1",
            "user_id": "user-1",
            "name": "Chem deck",
            "card_count": 2,
            "due_count": 1,
            "created_at": now,
            "updated_at": now,
        }
    )
    sb.db.setdefault("flashcards", []).extend(
        [
            {
                "id": "card-1",
                "user_id": "user-1",
                "deck_id": "deck-1",
                "ease": 2.5,
                "interval_days": 4,
                "repetitions": 3,
                "lapses": 1,
                "due_at": now,
                "last_reviewed_at": now,
                "is_suspended": False,
                "created_at": now,
                "updated_at": now,
            },
            {
                "id": "card-2",
                "user_id": "user-1",
                "deck_id": "deck-1",
                "ease": 2.3,
                "interval_days": 1,
                "repetitions": 1,
                "lapses": 0,
                "due_at": now,
                "is_suspended": True,
                "created_at": now,
                "updated_at": now,
            },
        ]
    )
    sb.db.setdefault("flashcard_reviews", []).append(
        {
            "card_id": "card-1",
            "user_id": "user-1",
            "rating": 4,
            "duration_ms": 1500,
            "prev_interval_days": 2,
            "new_interval_days": 4,
            "reviewed_at": now,
        }
    )
    sb.db.setdefault("mistake_entries", []).append(
        {
            "id": "mis-1",
            "user_id": "user-1",
            "root_cause": "concept",
            "difficulty": 3,
            "tags": [],
            "status": "open",
            "review_count": 0,
            "created_at": now,
            "updated_at": now,
        }
    )
    sb.db.setdefault("revision_items", []).extend(
        [
            {
                "id": "rev-1",
                "user_id": "user-1",
                "source_kind": "note",
                "source_id": "note-1",
                "title": "Reaction kinetics",
                "scheduled_for": "2026-06-01",
                "interval_days": 1,
                "ease": 2.5,
                "repetitions": 0,
                "status": "scheduled",
                "created_at": now,
                "updated_at": now,
            },
            {
                "id": "rev-2",
                "user_id": "user-1",
                "source_kind": "flashcard_deck",
                "source_id": "deck-1",
                "title": "Chem deck",
                "scheduled_for": "2026-06-02",
                "status": "completed",
                "completed_at": now,
                "created_at": now,
                "updated_at": now,
            },
        ]
    )


def test_artifacts_notes_returns_metadata_only_for_owner():
    sb = _seed_minimal_user()
    _seed_artifacts(sb)
    app = _app(sb)
    r = TestClient(app).get("/api/admin/study-os/users/user-1/artifacts/notes")
    assert r.status_code == 200
    items = r.json()["items"]
    # Only user-1 notes; other user's note never appears.
    assert {n["id"] for n in items} == {"note-1", "note-2"}
    # Metadata only — body / source_url MUST NOT leak.
    for n in items:
        assert "body" not in n and "source_url" not in n


def test_artifacts_notes_filters_by_is_archived():
    sb = _seed_minimal_user()
    _seed_artifacts(sb)
    app = _app(sb)
    r = TestClient(app).get("/api/admin/study-os/users/user-1/artifacts/notes?is_archived=true")
    assert r.status_code == 200
    assert [n["id"] for n in r.json()["items"]] == ["note-2"]


def test_artifacts_flashcards_returns_srs_state_without_front_back():
    sb = _seed_minimal_user()
    _seed_artifacts(sb)
    app = _app(sb)
    r = TestClient(app).get("/api/admin/study-os/users/user-1/artifacts/flashcards")
    assert r.status_code == 200
    items = r.json()["items"]
    assert {c["id"] for c in items} == {"card-1", "card-2"}
    for c in items:
        assert "front" not in c and "back" not in c and "hint" not in c
        # SRS state surfaced for the inspector.
        assert "ease" in c and "interval_days" in c and "due_at" in c


def test_artifacts_flashcard_srs_inspector_returns_card_and_history():
    sb = _seed_minimal_user()
    _seed_artifacts(sb)
    app = _app(sb)
    r = TestClient(app).get("/api/admin/study-os/users/user-1/artifacts/flashcards/card-1/srs")
    assert r.status_code == 200
    payload = r.json()
    assert payload["card"]["id"] == "card-1"
    # History rows surface rating/duration/interval transitions.
    assert len(payload["recent_reviews"]) == 1
    assert payload["recent_reviews"][0]["rating"] == 4


def test_artifacts_revision_reschedule_updates_date_and_audits():
    sb = _seed_minimal_user()
    _seed_artifacts(sb)
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/study-os/users/user-1/artifacts/revision/rev-1/reschedule",
        json={
            "reason": "user travelling — pushing back",
            "payload": {"scheduled_for": "2026-06-10"},
        },
    )
    assert r.status_code == 200, r.text
    item = next(i for i in sb.db["revision_items"] if i["id"] == "rev-1")
    assert item["scheduled_for"] == "2026-06-10"
    assert any(
        a["action"] == "study_os.artifacts.revision.reschedule"
        for a in sb.db["admin_audit_logs"]
    )


def test_artifacts_revision_reschedule_rejects_completed_items():
    sb = _seed_minimal_user()
    _seed_artifacts(sb)
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/study-os/users/user-1/artifacts/revision/rev-2/reschedule",
        json={"reason": "trying to re-arm completed", "payload": {"scheduled_for": "2026-06-10"}},
    )
    assert r.status_code == 409


def test_artifacts_revision_cancel_flips_status_to_skipped():
    sb = _seed_minimal_user()
    _seed_artifacts(sb)
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/study-os/users/user-1/artifacts/revision/rev-1/cancel",
        json={"reason": "user requested cancellation"},
    )
    assert r.status_code == 200
    assert next(i for i in sb.db["revision_items"] if i["id"] == "rev-1")["status"] == "skipped"


def test_snapshot_artifact_counts_use_correct_tables():
    """Phase 1 had table-name typos (user_notes / revision_schedule / mock_results);
    Phase 2 fixes them. This test pins the correct names so it can't regress."""
    sb = _seed_minimal_user()
    _seed_artifacts(sb)
    sb.db.setdefault("mock_tests", []).append(
        {"id": "m-1", "user_id": "user-1", "exam_name": "x", "attempted_at": "2026-05-01T00:00:00+00:00"}
    )
    app = _app(sb)
    r = TestClient(app).get("/api/admin/study-os/users/user-1/snapshot")
    assert r.status_code == 200
    arts = r.json()["artifacts"]
    assert arts["notes"] == 2  # not 0 — proves we hit personal_notes
    assert arts["revision_items"] == 2  # proves we hit revision_items
    assert arts["mocks"] == 1  # proves we hit mock_tests
    assert arts["mistakes"] == 1
    assert arts["flashcard_decks"] == 1
    assert arts["flashcards"] == 2


# ════════════════════════════════════════════════════════════════════════
#  Phase 2 — Mock Trust Console tests
# ════════════════════════════════════════════════════════════════════════


def _seed_mocks(sb: ExtSBStub) -> None:
    now = datetime.now(timezone.utc).isoformat()
    sb.db.setdefault("mock_tests", []).extend(
        [
            {
                "id": "mock-1",
                "user_id": "user-1",
                "exam_name": "exam-x",
                "test_name": "Full Length 1",
                "scored_marks": 80,
                "total_marks": 100,
                "review_state": "unreviewed",
                "attempted_at": now,
                "created_at": now,
            },
            {
                "id": "mock-2",
                "user_id": "user-other",
                "exam_name": "exam-x",
                "test_name": "Sectional 1",
                "scored_marks": 60,
                "total_marks": 100,
                "review_state": "reviewed",
                "attempted_at": now,
                "created_at": now,
            },
        ]
    )
    sb.db.setdefault("mock_score_verification", []).append(
        {
            "mock_test_id": "mock-1",
            "user_id": "user-1",
            "verification_tier": "tier_3",
            "verification_status": "unverified",
            "attester_role": "self",
        }
    )
    sb.db.setdefault("mock_subject_breakdowns", []).append(
        {"id": "br-1", "mock_test_id": "mock-1", "subject": "Chem", "correct_answers": 8}
    )
    sb.db.setdefault("mock_correction_tasks", []).append(
        {"id": "corr-1", "mock_test_id": "mock-1", "category": "concept_gap", "status": "open", "created_at": now}
    )


def test_mocks_queue_lists_recent_mocks_with_verification():
    sb = _seed_minimal_user()
    _seed_mocks(sb)
    app = _app(sb)
    r = TestClient(app).get("/api/admin/study-os/mocks/queue?limit=10")
    assert r.status_code == 200
    items = r.json()["items"]
    by_id = {m["id"]: m for m in items}
    assert "mock-1" in by_id and "mock-2" in by_id
    # mock-1 has a verification row; mock-2 doesn't.
    assert by_id["mock-1"]["verification"]["verification_tier"] == "tier_3"
    assert by_id["mock-2"]["verification"] is None


def test_mocks_queue_filters_by_user():
    sb = _seed_minimal_user()
    _seed_mocks(sb)
    app = _app(sb)
    r = TestClient(app).get("/api/admin/study-os/mocks/queue?user_id=user-1")
    assert r.status_code == 200
    assert [m["id"] for m in r.json()["items"]] == ["mock-1"]


def test_mocks_detail_returns_breakdowns_and_corrections():
    sb = _seed_minimal_user()
    _seed_mocks(sb)
    app = _app(sb)
    r = TestClient(app).get("/api/admin/study-os/mocks/mock-1")
    assert r.status_code == 200
    p = r.json()
    assert p["mock"]["id"] == "mock-1"
    assert p["subject_breakdowns"][0]["subject"] == "Chem"
    assert p["correction_tasks"][0]["category"] == "concept_gap"
    assert p["verification"]["verification_tier"] == "tier_3"


def test_mocks_set_verification_tier_upserts_and_audits():
    sb = _seed_minimal_user()
    _seed_mocks(sb)
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/study-os/mocks/mock-1/set-verification-tier",
        json={"reason": "screenshot reviewed by ops", "payload": {"tier": "tier_2", "evidence_url": "https://x/y.png"}},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["verification_tier"] == "tier_2"
    assert body["verification_status"] == "pending"
    # Row updated in place.
    row = next(v for v in sb.db["mock_score_verification"] if v["mock_test_id"] == "mock-1")
    assert row["verification_tier"] == "tier_2"
    assert row["attester_role"] == "admin"
    # Audit row written with previous_tier captured.
    audit = next(
        a for a in sb.db["admin_audit_logs"] if a["action"] == "study_os.mocks.set_verification_tier"
    )
    assert audit["new_value"]["previous_tier"] == "tier_3"
    assert audit["new_value"]["new_tier"] == "tier_2"


def test_mocks_set_verification_tier_rejects_invalid_tier():
    sb = _seed_minimal_user()
    _seed_mocks(sb)
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/study-os/mocks/mock-1/set-verification-tier",
        json={"reason": "trying a bad tier", "payload": {"tier": "tier_999"}},
    )
    assert r.status_code == 422


def test_mocks_set_verification_tier_404_for_unknown_mock():
    sb = _seed_minimal_user()
    _seed_mocks(sb)
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/study-os/mocks/no-such-mock/set-verification-tier",
        json={"reason": "ghost mock attempt", "payload": {"tier": "tier_1"}},
    )
    assert r.status_code == 404


# ════════════════════════════════════════════════════════════════════════
#  Phase 2 — Report Job Admin tests
# ════════════════════════════════════════════════════════════════════════


def _seed_reports(sb: ExtSBStub) -> None:
    now = datetime.now(timezone.utc).isoformat()
    sb.db.setdefault("report_exports", []).extend(
        [
            {
                "id": "rep-1",
                "user_id": "user-1",
                "report_type": "mock_analytics",
                "format": "pdf",
                "status": "failed",
                "error_message": "pdfkit blew up",
                "requested_at": now,
                "created_at": now,
                "updated_at": now,
                "expires_at": "2027-01-01T00:00:00+00:00",
            },
            {
                "id": "rep-2",
                "user_id": "user-1",
                "report_type": "weekly_summary",
                "format": "pdf",
                "status": "pending",
                "requested_at": now,
                "created_at": now,
                "updated_at": now,
                "expires_at": "2027-01-01T00:00:00+00:00",
            },
            {
                "id": "rep-3",
                "user_id": "user-other",
                "report_type": "mistake_book",
                "format": "csv",
                "status": "ready",
                "requested_at": now,
                "created_at": now,
                "updated_at": now,
                "expires_at": "2027-01-01T00:00:00+00:00",
            },
        ]
    )


def test_reports_queue_returns_rows_with_per_status_counts():
    sb = _seed_minimal_user()
    _seed_reports(sb)
    app = _app(sb)
    r = TestClient(app).get("/api/admin/study-os/reports/queue")
    assert r.status_code == 200
    p = r.json()
    assert len(p["items"]) == 3
    # Counts include every known status, with zeros for empty buckets.
    assert p["counts"]["failed"] == 1
    assert p["counts"]["pending"] == 1
    assert p["counts"]["ready"] == 1
    assert p["counts"]["generating"] == 0


def test_reports_queue_filters_by_status_and_user():
    sb = _seed_minimal_user()
    _seed_reports(sb)
    app = _app(sb)
    r = TestClient(app).get("/api/admin/study-os/reports/queue?status=failed&user_id=user-1")
    assert r.status_code == 200
    assert [it["id"] for it in r.json()["items"]] == ["rep-1"]


def test_reports_detail_404_for_unknown():
    sb = _seed_minimal_user()
    _seed_reports(sb)
    app = _app(sb)
    r = TestClient(app).get("/api/admin/study-os/reports/no-such")
    assert r.status_code == 404


def test_reports_retry_resets_failed_row_to_pending_and_clears_error():
    sb = _seed_minimal_user()
    _seed_reports(sb)
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/study-os/reports/rep-1/retry",
        json={"reason": "worker fixed, retrying"},
    )
    assert r.status_code == 200, r.text
    row = next(rp for rp in sb.db["report_exports"] if rp["id"] == "rep-1")
    assert row["status"] == "pending"
    assert row["error_message"] is None


def test_reports_retry_rejects_non_failed_rows():
    sb = _seed_minimal_user()
    _seed_reports(sb)
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/study-os/reports/rep-2/retry",
        json={"reason": "trying to retry pending"},
    )
    assert r.status_code == 409


def test_reports_cancel_pending_row_lands_as_failed_with_marker():
    sb = _seed_minimal_user()
    _seed_reports(sb)
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/study-os/reports/rep-2/cancel",
        json={"reason": "user no longer needs it"},
    )
    assert r.status_code == 200
    row = next(rp for rp in sb.db["report_exports"] if rp["id"] == "rep-2")
    assert row["status"] == "failed"
    assert "[admin:admin@example.com] cancelled:" in (row["error_message"] or "")


def test_reports_cancel_rejects_ready_row():
    sb = _seed_minimal_user()
    _seed_reports(sb)
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/study-os/reports/rep-3/cancel",
        json={"reason": "ready cancel not allowed"},
    )
    assert r.status_code == 409


def test_phase2_writes_reject_short_reason_uniformly():
    sb = _seed_minimal_user()
    _seed_artifacts(sb)
    _seed_mocks(sb)
    _seed_reports(sb)
    app = _app(sb)
    client = TestClient(app)
    body = {"reason": "tiny"}
    # All Phase 2 write endpoints share StudyOpsWriteBody.
    for path in [
        "/api/admin/study-os/users/user-1/artifacts/revision/rev-1/reschedule",
        "/api/admin/study-os/users/user-1/artifacts/revision/rev-1/cancel",
        "/api/admin/study-os/mocks/mock-1/set-verification-tier",
        "/api/admin/study-os/reports/rep-1/retry",
        "/api/admin/study-os/reports/rep-2/cancel",
    ]:
        assert client.post(path, json=body).status_code == 422, path
