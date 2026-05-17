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


# ════════════════════════════════════════════════════════════════════════
#  Phase 2 follow-up — open-content tests
# ════════════════════════════════════════════════════════════════════════


def _seed_content(sb: ExtSBStub) -> None:
    sb.db.setdefault("support_content_access", [])
    sb.db.setdefault("personal_notes", []).append(
        {
            "id": "open-note-1",
            "user_id": "user-1",
            "title": "Secret",
            "body": "actual note body here",
            "tags": [],
            "source_url": "https://x/y",
            "is_pinned": False,
            "is_archived": False,
            "created_at": "2026-05-01T00:00:00+00:00",
            "updated_at": "2026-05-01T00:00:00+00:00",
        }
    )
    sb.db.setdefault("flashcards", []).append(
        {
            "id": "open-card-1",
            "user_id": "user-1",
            "deck_id": "deck-1",
            "front": "What is X?",
            "back": "X is Y",
            "hint": "thinks about Z",
            "ease": 2.5,
            "interval_days": 3,
            "repetitions": 2,
            "lapses": 0,
            "due_at": "2026-05-01T00:00:00+00:00",
            "is_suspended": False,
            "created_at": "2026-05-01T00:00:00+00:00",
            "updated_at": "2026-05-01T00:00:00+00:00",
        }
    )
    sb.db.setdefault("mistake_entries", []).append(
        {
            "id": "open-mis-1",
            "user_id": "user-1",
            "question_text": "real question text",
            "correct_answer": "B",
            "my_answer": "A",
            "reason": "misread option",
            "root_cause": "concept",
            "difficulty": 3,
            "tags": [],
            "status": "open",
            "review_count": 0,
            "created_at": "2026-05-01T00:00:00+00:00",
            "updated_at": "2026-05-01T00:00:00+00:00",
        }
    )


def test_open_note_returns_body_and_logs_access():
    sb = _seed_minimal_user()
    _seed_content(sb)
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/study-os/users/user-1/artifacts/notes/open-note-1/open",
        json={"reason": "user reported missing content"},
    )
    assert r.status_code == 200, r.text
    p = r.json()
    # Substantive content returned
    assert p["note"]["body"] == "actual note body here"
    # Access logged
    assert len(sb.db["support_content_access"]) == 1
    log = sb.db["support_content_access"][0]
    assert log["artifact_kind"] == "note"
    assert log["artifact_id"] == "open-note-1"
    assert log["actor_email"] == "admin@example.com"
    assert log["user_id"] == "user-1"
    assert "body" in log["fields_returned"]


def test_open_note_rejects_wrong_owner():
    sb = _seed_minimal_user()
    _seed_content(sb)
    sb.db["personal_notes"][0]["user_id"] = "user-other"
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/study-os/users/user-1/artifacts/notes/open-note-1/open",
        json={"reason": "trying wrong owner"},
    )
    assert r.status_code == 409


def test_open_flashcard_returns_front_back_hint_and_logs():
    sb = _seed_minimal_user()
    _seed_content(sb)
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/study-os/users/user-1/artifacts/flashcards/open-card-1/open",
        json={"reason": "debugging SRS dispute"},
    )
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["card"]["front"] == "What is X?"
    assert p["card"]["back"] == "X is Y"
    assert p["card"]["hint"] == "thinks about Z"
    log = sb.db["support_content_access"][0]
    assert log["artifact_kind"] == "flashcard"


def test_open_mistake_returns_full_text_and_logs():
    sb = _seed_minimal_user()
    _seed_content(sb)
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/study-os/users/user-1/artifacts/mistakes/open-mis-1/open",
        json={"reason": "investigating mock dispute"},
    )
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["mistake"]["question_text"] == "real question text"
    assert p["mistake"]["correct_answer"] == "B"
    log = sb.db["support_content_access"][0]
    assert log["artifact_kind"] == "mistake"
    assert "question_text" in log["fields_returned"]


def test_open_endpoints_404_for_unknown_artifact():
    sb = _seed_minimal_user()
    _seed_content(sb)
    app = _app(sb)
    client = TestClient(app)
    body = {"reason": "ghost artifact lookup"}
    for path in [
        "/api/admin/study-os/users/user-1/artifacts/notes/nope/open",
        "/api/admin/study-os/users/user-1/artifacts/flashcards/nope/open",
        "/api/admin/study-os/users/user-1/artifacts/mistakes/nope/open",
    ]:
        assert client.post(path, json=body).status_code == 404, path


# ════════════════════════════════════════════════════════════════════════
#  Phase 3 — Social admin tests
# ════════════════════════════════════════════════════════════════════════


def _seed_social(sb: ExtSBStub) -> None:
    now = datetime.now(timezone.utc).isoformat()
    sb.db.setdefault("study_groups", []).extend(
        [
            {
                "id": "grp-1",
                "name": "Chem Crew",
                "group_type": "behavior",
                "max_members": 8,
                "visibility": "private",
                "created_by": "user-1",
                "status": "active",
                "created_at": now,
                "updated_at": now,
            },
            {
                "id": "grp-2",
                "name": "Archived",
                "group_type": "behavior",
                "max_members": 8,
                "visibility": "private",
                "created_by": "user-2",
                "status": "archived",
                "created_at": now,
                "updated_at": now,
            },
        ]
    )
    sb.db.setdefault("study_group_members", []).extend(
        [
            {"id": "mem-1", "group_id": "grp-1", "user_id": "user-1", "role": "owner", "status": "active", "joined_at": now},
            {"id": "mem-2", "group_id": "grp-1", "user_id": "user-2", "role": "member", "status": "active", "joined_at": now},
            {"id": "mem-3", "group_id": "grp-1", "user_id": "user-3", "role": "member", "status": "left", "joined_at": now},
        ]
    )
    sb.db.setdefault("accountability_pairs", []).extend(
        [
            {"id": "pair-1", "user_a": "user-1", "user_b": "user-2", "pairing_goal": "discipline", "status": "active", "created_at": now},
            {"id": "pair-2", "user_a": "user-3", "user_b": "user-4", "pairing_goal": "mock_review", "status": "ended", "created_at": now},
        ]
    )
    sb.db.setdefault("social_study_sessions", []).extend(
        [
            {
                "id": "ses-1",
                "session_type": "group",
                "group_id": "grp-1",
                "started_at": now,
                "ended_at": None,
                "planned_minutes": 60,
                "trust_source": "group_focus_checked",
                "trust_weight": 0.9,
                "created_at": now,
            },
            {
                "id": "ses-2",
                "session_type": "partner",
                "partner_pair_id": "pair-1",
                "started_at": now,
                "ended_at": now,
                "planned_minutes": 30,
                "trust_source": "partner_costudy",
                "trust_weight": 0.7,
                "created_at": now,
            },
        ]
    )
    sb.db.setdefault("study_behavior_source_breakdown", []).append(
        {
            "id": "br-1",
            "user_id": "user-1",
            "snapshot_date": "2026-05-15",
            "source": "solo_timer",
            "raw_minutes": 60.0,
            "trust_weight": 0.6,
            "trust_adjusted_minutes": 36.0,
            "created_at": now,
        }
    )
    sb.db.setdefault("study_leaderboard_entries", []).extend(
        [
            {
                "id": "lb-1",
                "board_type": "behavior",
                "subject_type": "user",
                "cohort_key": "global",
                "metric_key": "weekly_hours",
                "user_id": "user-1",
                "score": 30.0,
                "rank": 1,
                "is_hidden": False,
                "period_end": "2026-05-15",
                "created_at": now,
            },
            {
                "id": "lb-2",
                "board_type": "behavior",
                "subject_type": "user",
                "user_id": "user-2",
                "score": 25.0,
                "rank": 2,
                "is_hidden": True,
                "hidden_reason": "abuse",
                "period_end": "2026-05-15",
                "created_at": now,
            },
        ]
    )
    sb.db.setdefault("mentor_session_feedback", []).extend(
        [
            {
                "id": "fb-1",
                "session_id": "ms-1",
                "mentor_id": "user-1",
                "mentee_id": "user-3",
                "discipline_rating": 5,
                "preparation_rating": 4,
                "follow_through_rating": 4,
                "is_hidden": False,
                "created_at": now,
            },
            {
                "id": "fb-2",
                "session_id": "ms-2",
                "mentor_id": "user-1",
                "mentee_id": "user-4",
                "discipline_rating": 1,
                "preparation_rating": 1,
                "follow_through_rating": 1,
                "is_hidden": True,
                "hidden_reason": "abusive",
                "created_at": now,
            },
        ]
    )
    sb.db.setdefault("admin_audit_logs", [])


def test_social_groups_list_filters_by_status():
    sb = _seed_minimal_user()
    _seed_social(sb)
    app = _app(sb)
    r = TestClient(app).get("/api/admin/study-os/social/groups?status=active")
    assert r.status_code == 200
    assert [g["id"] for g in r.json()["items"]] == ["grp-1"]


def test_social_group_members_filters_by_status():
    sb = _seed_minimal_user()
    _seed_social(sb)
    app = _app(sb)
    r = TestClient(app).get("/api/admin/study-os/social/groups/grp-1/members?status=active")
    assert r.status_code == 200
    ids = {m["id"] for m in r.json()["items"]}
    assert ids == {"mem-1", "mem-2"}


def test_social_group_archive_flips_status_and_audits():
    sb = _seed_minimal_user()
    _seed_social(sb)
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/study-os/social/groups/grp-1/archive",
        json={"reason": "moderation: spam reports"},
    )
    assert r.status_code == 200
    assert next(g for g in sb.db["study_groups"] if g["id"] == "grp-1")["status"] == "archived"
    assert any(a["action"] == "study_os.social.groups.archive" for a in sb.db["admin_audit_logs"])


def test_social_group_archive_rejects_already_archived():
    sb = _seed_minimal_user()
    _seed_social(sb)
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/study-os/social/groups/grp-2/archive",
        json={"reason": "double archive attempt"},
    )
    assert r.status_code == 409


def test_social_group_transfer_ownership_requires_active_member():
    sb = _seed_minimal_user()
    _seed_social(sb)
    app = _app(sb)
    # user-3 has status='left' on grp-1 — must be refused
    r = TestClient(app).post(
        "/api/admin/study-os/social/groups/grp-1/transfer-ownership",
        json={"reason": "moving ownership", "payload": {"new_owner_id": "user-3"}},
    )
    assert r.status_code == 409


def test_social_group_transfer_ownership_succeeds_for_active_member():
    sb = _seed_minimal_user()
    _seed_social(sb)
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/study-os/social/groups/grp-1/transfer-ownership",
        json={"reason": "moving ownership to active member", "payload": {"new_owner_id": "user-2"}},
    )
    assert r.status_code == 200
    g = next(g for g in sb.db["study_groups"] if g["id"] == "grp-1")
    assert g["created_by"] == "user-2"
    assert next(m for m in sb.db["study_group_members"] if m["id"] == "mem-2")["role"] == "owner"


def test_partner_pairs_dissolve_active_pair():
    sb = _seed_minimal_user()
    _seed_social(sb)
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/study-os/social/partner-pairs/pair-1/dissolve",
        json={"reason": "user reported abusive partner"},
    )
    assert r.status_code == 200
    assert next(p for p in sb.db["accountability_pairs"] if p["id"] == "pair-1")["status"] == "ended"


def test_partner_pairs_dissolve_rejects_already_ended():
    sb = _seed_minimal_user()
    _seed_social(sb)
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/study-os/social/partner-pairs/pair-2/dissolve",
        json={"reason": "trying to double-end"},
    )
    assert r.status_code == 409


def test_social_sessions_active_only_filter():
    sb = _seed_minimal_user()
    _seed_social(sb)
    app = _app(sb)
    r = TestClient(app).get("/api/admin/study-os/social/sessions?active_only=true")
    assert r.status_code == 200
    assert [s["id"] for s in r.json()["items"]] == ["ses-1"]


def test_social_sessions_force_end_closes_session():
    sb = _seed_minimal_user()
    _seed_social(sb)
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/study-os/social/sessions/ses-1/force-end",
        json={"reason": "session stuck after host left"},
    )
    assert r.status_code == 200
    assert next(s for s in sb.db["social_study_sessions"] if s["id"] == "ses-1")["ended_at"] is not None


def test_trust_breakdown_returns_rows_and_aggregate():
    sb = _seed_minimal_user()
    _seed_social(sb)
    # Make the seed row fall inside the 90-day window relative to "today".
    from datetime import date as _date
    sb.db["study_behavior_source_breakdown"][0]["snapshot_date"] = _date.today().isoformat()
    app = _app(sb)
    r = TestClient(app).get("/api/admin/study-os/social/trust/user-1/breakdown?days=90")
    assert r.status_code == 200
    p = r.json()
    assert len(p["rows"]) == 1
    assert p["by_source"]["solo_timer"]["raw_minutes"] == 60.0


def test_leaderboard_hide_flips_is_hidden():
    sb = _seed_minimal_user()
    _seed_social(sb)
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/study-os/social/leaderboard/lb-1/hide",
        json={"reason": "abuse - suspicious score"},
    )
    assert r.status_code == 200
    row = next(e for e in sb.db["study_leaderboard_entries"] if e["id"] == "lb-1")
    assert row["is_hidden"] is True
    assert row["hidden_reason"] == "abuse - suspicious score"


def test_leaderboard_restore_flips_is_hidden_back():
    sb = _seed_minimal_user()
    _seed_social(sb)
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/study-os/social/leaderboard/lb-2/restore",
        json={"reason": "false-positive review"},
    )
    assert r.status_code == 200
    row = next(e for e in sb.db["study_leaderboard_entries"] if e["id"] == "lb-2")
    assert row["is_hidden"] is False
    assert row["hidden_reason"] is None


def test_leaderboard_hide_rejects_already_hidden():
    sb = _seed_minimal_user()
    _seed_social(sb)
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/study-os/social/leaderboard/lb-2/hide",
        json={"reason": "double hide attempt"},
    )
    assert r.status_code == 409


def test_leaderboard_list_hidden_only_filter():
    sb = _seed_minimal_user()
    _seed_social(sb)
    app = _app(sb)
    r = TestClient(app).get("/api/admin/study-os/social/leaderboard?hidden_only=true")
    assert r.status_code == 200
    assert [e["id"] for e in r.json()["items"]] == ["lb-2"]


def test_mentor_feedback_hide_and_restore_cycle():
    sb = _seed_minimal_user()
    _seed_social(sb)
    app = _app(sb)
    client = TestClient(app)
    r = client.post(
        "/api/admin/study-os/social/mentor-feedback/fb-1/hide",
        json={"reason": "mentee reported abuse"},
    )
    assert r.status_code == 200
    assert next(f for f in sb.db["mentor_session_feedback"] if f["id"] == "fb-1")["is_hidden"] is True
    r = client.post(
        "/api/admin/study-os/social/mentor-feedback/fb-1/restore",
        json={"reason": "false positive review"},
    )
    assert r.status_code == 200
    assert next(f for f in sb.db["mentor_session_feedback"] if f["id"] == "fb-1")["is_hidden"] is False


def test_phase3_writes_reject_short_reason():
    sb = _seed_minimal_user()
    _seed_social(sb)
    app = _app(sb)
    client = TestClient(app)
    body = {"reason": "x"}
    for path in [
        "/api/admin/study-os/social/groups/grp-1/archive",
        "/api/admin/study-os/social/groups/grp-1/transfer-ownership",
        "/api/admin/study-os/social/partner-pairs/pair-1/dissolve",
        "/api/admin/study-os/social/sessions/ses-1/force-end",
        "/api/admin/study-os/social/trust/user-1/recompute",
        "/api/admin/study-os/social/leaderboard/lb-1/hide",
        "/api/admin/study-os/social/leaderboard/lb-2/restore",
        "/api/admin/study-os/social/mentor-feedback/fb-1/hide",
        "/api/admin/study-os/social/mentor-feedback/fb-2/restore",
    ]:
        assert client.post(path, json=body).status_code == 422, path


# ════════════════════════════════════════════════════════════════════════
#  Phase 4 — Exam Intelligence CMS tests
# ════════════════════════════════════════════════════════════════════════


from app.api import admin_exam_intel_cms as cms_api  # noqa: E402


def _cms_app(sb: ExtSBStub, role: str = "super_admin") -> FastAPI:
    app = FastAPI()
    app.include_router(cms_api.router, prefix="/api")
    cms_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    core_config.get_settings.cache_clear()
    settings = core_config.get_settings()
    settings.ADMIN_STUDY_OS_ENABLED = True
    app.dependency_overrides[get_current_user] = lambda: {
        "id": "admin-1",
        "email": "admin@example.com",
        "role": role,
        "permissions": [],
    }
    return app


def _seed_cms(sb: ExtSBStub) -> None:
    now = datetime.now(timezone.utc).isoformat()
    sb.db.setdefault("exam_families", []).append(
        {"id": "fam-1", "slug": "fam-x", "name": "Family X", "is_active": True, "created_at": now, "updated_at": now}
    )
    sb.db.setdefault("exams", []).append(
        {
            "id": "exam-1",
            "exam_family_id": "fam-1",
            "slug": "exam-x",
            "name": "Exam X",
            "exam_type": "recruitment",
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        }
    )
    sb.db.setdefault("exam_cycles", [])
    sb.db.setdefault("exam_phases", [])
    sb.db.setdefault("syllabus_documents", [])
    sb.db.setdefault("pyq_papers", [])
    sb.db.setdefault("pyq_questions", [])
    sb.db.setdefault("pyq_options", [])
    sb.db.setdefault("exam_topic_coverage", [])
    sb.db.setdefault("exam_policy_updates", [])
    sb.db.setdefault("admin_audit_logs", [])


def test_cms_flag_off_returns_404():
    sb = ExtSBStub()
    _seed_cms(sb)
    app = _cms_app(sb)
    core_config.get_settings().ADMIN_STUDY_OS_ENABLED = False
    client = TestClient(app)
    assert client.get("/api/admin/exam-intelligence-cms/exam-families").status_code == 404
    assert client.post("/api/admin/exam-intelligence-cms/exam-families", json={"reason": "x" * 10, "payload": {}}).status_code == 404


def test_cms_create_exam_family_inserts_and_audits():
    sb = ExtSBStub()
    _seed_cms(sb)
    app = _cms_app(sb)
    r = TestClient(app).post(
        "/api/admin/exam-intelligence-cms/exam-families",
        json={"reason": "seeding new family", "payload": {"slug": "new-fam", "name": "New Family"}},
    )
    assert r.status_code == 200, r.text
    assert any(f["slug"] == "new-fam" for f in sb.db["exam_families"])
    assert any(a["action"] == "exam_intel.cms.family.create" for a in sb.db["admin_audit_logs"])


def test_cms_create_exam_requires_resolvable_family():
    sb = ExtSBStub()
    _seed_cms(sb)
    app = _cms_app(sb)
    r = TestClient(app).post(
        "/api/admin/exam-intelligence-cms/exams",
        json={"reason": "bogus family id", "payload": {"slug": "z", "name": "Z", "exam_family_id": "nope"}},
    )
    assert r.status_code == 422


def test_cms_create_exam_rejects_invalid_type():
    sb = ExtSBStub()
    _seed_cms(sb)
    app = _cms_app(sb)
    r = TestClient(app).post(
        "/api/admin/exam-intelligence-cms/exams",
        json={"reason": "bad type", "payload": {"slug": "z", "name": "Z", "exam_type": "weird"}},
    )
    assert r.status_code == 422


def test_cms_update_exam_patches_allowed_fields_only():
    sb = ExtSBStub()
    _seed_cms(sb)
    app = _cms_app(sb)
    r = TestClient(app).patch(
        "/api/admin/exam-intelligence-cms/exams/exam-1",
        json={"reason": "renaming exam", "payload": {"name": "Exam X Renamed", "bogus_field": "ignored"}},
    )
    assert r.status_code == 200
    exam = next(e for e in sb.db["exams"] if e["id"] == "exam-1")
    assert exam["name"] == "Exam X Renamed"
    assert "bogus_field" not in exam


def test_cms_create_cycle_requires_exam_id():
    sb = ExtSBStub()
    _seed_cms(sb)
    app = _cms_app(sb)
    r = TestClient(app).post(
        "/api/admin/exam-intelligence-cms/exam-cycles",
        json={"reason": "missing exam id", "payload": {"year": 2026, "cycle_name": "Y"}},
    )
    assert r.status_code == 422


def test_cms_create_cycle_succeeds_with_valid_exam():
    sb = ExtSBStub()
    _seed_cms(sb)
    app = _cms_app(sb)
    r = TestClient(app).post(
        "/api/admin/exam-intelligence-cms/exam-cycles",
        json={
            "reason": "creating 2026 cycle",
            "payload": {"exam_id": "exam-1", "year": 2026, "cycle_name": "Mains", "status": "expected"},
        },
    )
    assert r.status_code == 200
    assert any(c["cycle_name"] == "Mains" for c in sb.db["exam_cycles"])


def test_cms_create_syllabus_document_forces_pending():
    sb = ExtSBStub()
    _seed_cms(sb)
    app = _cms_app(sb)
    r = TestClient(app).post(
        "/api/admin/exam-intelligence-cms/syllabus-documents",
        json={
            "reason": "uploading new notification",
            "payload": {
                "exam_id": "exam-1",
                "document_type": "notification",
                "title": "Notif 2026",
                "trust_status": "verified",  # operator tries to bypass
            },
        },
    )
    assert r.status_code == 200
    # Spec §12 #4 — admin cannot auto-publish from CMS
    assert sb.db["syllabus_documents"][0]["trust_status"] == "pending"


def test_cms_create_pyq_paper_forces_pending():
    sb = ExtSBStub()
    _seed_cms(sb)
    app = _cms_app(sb)
    r = TestClient(app).post(
        "/api/admin/exam-intelligence-cms/pyq-papers",
        json={
            "reason": "uploading PYQ paper",
            "payload": {"exam_id": "exam-1", "year": 2025, "source_type": "official", "trust_status": "verified"},
        },
    )
    assert r.status_code == 200
    assert sb.db["pyq_papers"][0]["trust_status"] == "pending"


def test_cms_create_pyq_question_with_options_inserts_both():
    sb = ExtSBStub()
    _seed_cms(sb)
    sb.db["pyq_papers"].append({"id": "p-1", "exam_id": "exam-1", "year": 2025})
    app = _cms_app(sb)
    r = TestClient(app).post(
        "/api/admin/exam-intelligence-cms/pyq-questions",
        json={
            "reason": "adding question + options atomically",
            "payload": {
                "pyq_paper_id": "p-1",
                "question_text": "What is X?",
                "question_type": "mcq",
                "options": [
                    {"option_label": "A", "option_text": "first", "is_correct": False},
                    {"option_label": "B", "option_text": "second", "is_correct": True},
                ],
            },
        },
    )
    assert r.status_code == 200, r.text
    assert sb.db["pyq_questions"][0]["reviewer_status"] == "pending"
    assert len(sb.db["pyq_options"]) == 2
    assert {o["option_label"] for o in sb.db["pyq_options"]} == {"A", "B"}


def test_cms_create_topic_coverage_forces_pending_review():
    sb = ExtSBStub()
    _seed_cms(sb)
    app = _cms_app(sb)
    r = TestClient(app).post(
        "/api/admin/exam-intelligence-cms/exam-topic-coverage",
        json={
            "reason": "adding coverage row",
            "payload": {"exam_id": "exam-1", "topic_id": "t-1", "priority": 5, "is_high_yield": True},
        },
    )
    assert r.status_code == 200
    assert sb.db["exam_topic_coverage"][0]["reviewer_status"] == "pending_review"


def test_cms_create_policy_update_rejects_unofficial_affects_flags():
    sb = ExtSBStub()
    _seed_cms(sb)
    app = _cms_app(sb)
    r = TestClient(app).post(
        "/api/admin/exam-intelligence-cms/policy-updates",
        json={
            "reason": "non-official source claims syllabus change",
            "payload": {
                "exam_id": "exam-1",
                "update_type": "syllabus_change",
                "title": "Random claim",
                "source_type": "community",
                "affects_syllabus": True,
            },
        },
    )
    assert r.status_code == 422


def test_cms_create_policy_update_official_lands_pending():
    sb = ExtSBStub()
    _seed_cms(sb)
    app = _cms_app(sb)
    r = TestClient(app).post(
        "/api/admin/exam-intelligence-cms/policy-updates",
        json={
            "reason": "official notification published",
            "payload": {
                "exam_id": "exam-1",
                "update_type": "syllabus_change",
                "title": "2026 syllabus revision",
                "source_type": "official",
                "affects_syllabus": True,
            },
        },
    )
    assert r.status_code == 200
    row = sb.db["exam_policy_updates"][0]
    assert row["reviewer_status"] == "pending"
    assert row["affects_syllabus"] is True


def test_cms_soft_delete_family_flips_is_active():
    sb = ExtSBStub()
    _seed_cms(sb)
    app = _cms_app(sb)
    r = TestClient(app).delete(
        "/api/admin/exam-intelligence-cms/exam-families/fam-1?reason=removing+inactive+family"
    )
    assert r.status_code == 200
    assert next(f for f in sb.db["exam_families"] if f["id"] == "fam-1")["is_active"] is False


def test_cms_writes_reject_short_reason():
    sb = ExtSBStub()
    _seed_cms(sb)
    app = _cms_app(sb)
    client = TestClient(app)
    body = {"reason": "x"}
    for path in [
        "/api/admin/exam-intelligence-cms/exam-families",
        "/api/admin/exam-intelligence-cms/exams",
        "/api/admin/exam-intelligence-cms/exam-cycles",
        "/api/admin/exam-intelligence-cms/exam-phases",
        "/api/admin/exam-intelligence-cms/syllabus-documents",
        "/api/admin/exam-intelligence-cms/pyq-papers",
        "/api/admin/exam-intelligence-cms/pyq-questions",
        "/api/admin/exam-intelligence-cms/exam-topic-coverage",
        "/api/admin/exam-intelligence-cms/policy-updates",
    ]:
        assert client.post(path, json=body).status_code == 422, path
