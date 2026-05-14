"""Tests for the PR4 admin persona controls API."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import admin_persona as admin_persona_api
from app.core.auth import get_current_user, require_permission
from tests.persona_questions._stub import SBStub


# ─── Test app fixture ──────────────────────────────────────────────────────
def _build_app(sb: SBStub, role: str = "super_admin"):
    """Mount the admin router with a stubbed Supabase + injected user."""
    app = FastAPI()
    app.include_router(admin_persona_api.router, prefix="/api")
    admin_persona_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]

    user_dict = {
        "id": "admin-1",
        "role": role,
        "permissions": ["persona.manage"] if role == "admin" else [],
    }
    app.dependency_overrides[get_current_user] = lambda: user_dict
    return app


def _seed_bank():
    return [
        {
            "id": "q1",
            "question_key": "mock_behavior",
            "question_text": "How do you handle mocks?",
            "help_text": None,
            "data_type": "single_select",
            "options": [
                {"value": "avoid_mocks", "label": "Avoid"},
                {"value": "analyze_every_mock", "label": "Analyze"},
            ],
            "target_dimension": "learning_behavior",
            "priority": 50,
            "trigger_rules": {},
            "applies_when": {},
            "is_active": True,
            "created_at": "2026-01-01T00:00:00+00:00",
            "updated_at": "2026-01-01T00:00:00+00:00",
        },
        {
            "id": "q2",
            "question_key": "preparation_stage_self_assessment",
            "question_text": "Where are you?",
            "data_type": "single_select",
            "options": [{"value": "just_starting", "label": "Just starting"}],
            "target_dimension": "preparation_stage",
            "priority": 10,
            "is_active": True,
            "created_at": "2026-01-01T00:00:00+00:00",
        },
        {
            "id": "q3",
            "question_key": "primary_weak_area",
            "question_text": "Weakest?",
            "data_type": "single_select",
            "options": [{"value": "quant", "label": "Quant"}],
            "target_dimension": "learning_behavior",
            "priority": 80,
            "is_active": False,
            "created_at": "2026-01-01T00:00:00+00:00",
        },
    ]


def _seed_full():
    now = datetime.now(timezone.utc).isoformat()
    yesterday = (datetime.now(timezone.utc) - timedelta(hours=12)).isoformat()
    old = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
    return {
        "persona_question_bank": _seed_bank(),
        "aspirant_persona_snapshots": [
            {
                "id": "s1",
                "user_id": "user-1",
                "persona_version": "v1",
                "primary_persona": "beginner_aspirant",
                "dimensions": {"preparation_stage": "beginner", "time_constraint": "low_availability"},
                "scores": {"confidence": 0.6},
                "study_policy": {"preferred_task_size": "small"},
                "computed_at": yesterday,
            },
            {
                "id": "s2",
                "user_id": "user-1",
                "persona_version": "v1",
                "primary_persona": "beginner_aspirant",
                "dimensions": {"preparation_stage": "beginner"},
                "scores": {"confidence": 0.5},
                "study_policy": {},
                "computed_at": old,
            },
        ],
        "persona_question_answers": [
            {
                "id": "a1",
                "user_id": "user-1",
                "question_key": "mock_behavior",
                "normalized_value": "avoid_mocks",
                "answer_value": "avoid_mocks",
                "skipped": False,
                "source": "persona_tiny_question",
                "created_at": yesterday,
            }
        ],
        "user_signal_events": [
            {
                "id": "ev1",
                "user_id": "user-1",
                "event_type": "persona_question_answered",
                "payload": {"question_key": "mock_behavior"},
                "processed_at": None,
                "created_at": yesterday,
            }
        ],
        "persona_recompute_queue": [
            {
                "id": "rq1",
                "user_id": "user-1",
                "reason": "manual",
                "status": "pending",
                "attempts": 0,
                "error_message": None,
                "created_at": yesterday,
                "processed_at": None,
            },
            {
                "id": "rq2",
                "user_id": "user-1",
                "reason": "manual",
                "status": "completed",
                "attempts": 1,
                "error_message": None,
                "created_at": yesterday,
                "processed_at": now,
            },
            {
                "id": "rq3",
                "user_id": "user-2",
                "reason": "manual",
                "status": "failed",
                "attempts": 2,
                "error_message": "boom",
                "created_at": yesterday,
                "processed_at": yesterday,
            },
        ],
    }


# ─── Access control ────────────────────────────────────────────────────────
def test_non_admin_cannot_access_overview():
    sb = SBStub(_seed_full())
    app = _build_app(sb, role="user")  # not admin, no perm
    client = TestClient(app)
    r = client.get("/api/admin/persona/overview")
    assert r.status_code == 403


def test_admin_can_access_overview():
    sb = SBStub(_seed_full())
    app = _build_app(sb, role="super_admin")
    client = TestClient(app)
    r = client.get("/api/admin/persona/overview")
    assert r.status_code == 200
    data = r.json()
    assert data["questions"]["active"] == 2
    assert data["questions"]["inactive"] == 1
    assert data["snapshots"]["total"] == 2
    assert data["queue"]["pending"] == 1
    assert data["queue"]["failed"] == 1


def test_admin_with_persona_perm_can_access():
    sb = SBStub(_seed_full())
    app = _build_app(sb, role="admin")  # has persona.manage perm
    client = TestClient(app)
    r = client.get("/api/admin/persona/overview")
    assert r.status_code == 200


def test_overview_includes_risk_distribution_and_policy_health():
    sb = SBStub(_seed_full())
    app = _build_app(sb, role="super_admin")
    client = TestClient(app)
    data = client.get("/api/admin/persona/overview").json()
    # s1 has a non-empty study_policy, s2 has {} → partial generation health.
    assert data["policy"]["generation_status"] == "partial"
    assert data["policy"]["with_policy"] == 1
    # Neither seeded snapshot carries study_risk/dropoff_risk scores.
    assert data["risk"]["high_study_risk"] == 0
    assert data["risk"]["high_dropoff_risk"] == 0
    # s2 is ~10 days old → not stale under the 14-day cutoff.
    assert data["snapshots"]["stale"] == 0
    # Both snapshots carry preparation_stage=beginner.
    dist = data["dimensions"]["distribution"]
    assert dist["preparation_stage"]["beginner"] == 2
    assert dist["time_constraint"]["low_availability"] == 1


def test_overview_flags_high_risk_cohorts():
    now = datetime.now(timezone.utc).isoformat()
    sb = SBStub(
        {
            "aspirant_persona_snapshots": [
                {
                    "id": "s-risk",
                    "user_id": "user-risk",
                    "persona_version": "v1",
                    "primary_persona": "deadline_repeater",
                    "dimensions": {"motivation_state": "deadline_anxious"},
                    "scores": {"study_risk": 0.72, "dropoff_risk": 0.81},
                    "study_policy": {"preferred_task_size": "small"},
                    "computed_at": now,
                },
            ],
        }
    )
    app = _build_app(sb, role="super_admin")
    client = TestClient(app)
    data = client.get("/api/admin/persona/overview").json()
    assert data["risk"]["high_study_risk"] == 1
    assert data["risk"]["high_dropoff_risk"] == 1
    assert data["policy"]["generation_status"] == "ok"


def test_user_without_perm_blocked_on_every_endpoint():
    sb = SBStub(_seed_full())
    app = _build_app(sb, role="user")
    client = TestClient(app)
    for path, method in [
        ("/api/admin/persona/overview", "get"),
        ("/api/admin/persona/question-bank", "get"),
        ("/api/admin/persona/snapshots", "get"),
        ("/api/admin/persona/users/user-1", "get"),
        ("/api/admin/persona/recompute-queue", "get"),
        ("/api/admin/persona/signal-events", "get"),
    ]:
        r = getattr(client, method)(path)
        assert r.status_code == 403, path


# ─── Question bank ────────────────────────────────────────────────────────
def test_list_question_bank_filters_active():
    sb = SBStub(_seed_full())
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/persona/question-bank?active=true")
    assert r.status_code == 200
    body = r.json()
    assert all(q["is_active"] for q in body["items"])
    assert body["count"] == 2


def test_list_question_bank_filters_inactive():
    sb = SBStub(_seed_full())
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/persona/question-bank?active=false")
    assert r.status_code == 200
    body = r.json()
    assert len(body["items"]) == 1
    assert body["items"][0]["question_key"] == "primary_weak_area"


def test_list_question_bank_search_filter():
    sb = SBStub(_seed_full())
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/persona/question-bank?q=mock")
    assert r.status_code == 200
    assert any("mock" in (q["question_key"] or "").lower() for q in r.json()["items"])


def test_patch_question_allowed_fields():
    sb = SBStub(_seed_full())
    client = TestClient(_build_app(sb))
    r = client.patch(
        "/api/admin/persona/question-bank/mock_behavior",
        json={"question_text": "How do you usually handle mocks?", "priority": 25, "is_active": True},
    )
    assert r.status_code == 200
    updated = r.json()
    assert updated["priority"] == 25
    assert updated["question_text"] == "How do you usually handle mocks?"


def test_patch_question_invalid_options_rejected():
    sb = SBStub(_seed_full())
    client = TestClient(_build_app(sb))
    r = client.patch(
        "/api/admin/persona/question-bank/mock_behavior",
        json={"options": []},
    )
    assert r.status_code == 400


def test_patch_question_empty_text_rejected():
    sb = SBStub(_seed_full())
    client = TestClient(_build_app(sb))
    r = client.patch(
        "/api/admin/persona/question-bank/mock_behavior",
        json={"question_text": "   "},
    )
    assert r.status_code == 400


def test_patch_unknown_question_returns_404():
    sb = SBStub(_seed_full())
    client = TestClient(_build_app(sb))
    r = client.patch(
        "/api/admin/persona/question-bank/never_existed",
        json={"is_active": False},
    )
    assert r.status_code == 404


def test_patch_question_normalises_string_options():
    sb = SBStub(_seed_full())
    client = TestClient(_build_app(sb))
    r = client.patch(
        "/api/admin/persona/question-bank/mock_behavior",
        json={"options": ["avoid_mocks", "analyze_every_mock"]},
    )
    assert r.status_code == 200
    opts = r.json()["options"]
    assert opts[0] == {"value": "avoid_mocks", "label": "avoid_mocks"}


def test_patch_question_rejects_unknown_field_via_pydantic():
    # Pydantic strictly drops unknown fields by default but our payload
    # surface is locked anyway; explicit assertion that data_type cannot
    # be changed by sending raw JSON.
    sb = SBStub(_seed_full())
    client = TestClient(_build_app(sb))
    r = client.patch(
        "/api/admin/persona/question-bank/mock_behavior",
        json={"data_type": "text"},
    )
    # pydantic will simply ignore the extra field; the existing row stays.
    assert r.status_code == 200
    assert r.json()["data_type"] == "single_select"


# ─── Snapshots ────────────────────────────────────────────────────────────
def test_admin_can_list_snapshots():
    sb = SBStub(_seed_full())
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/persona/snapshots")
    assert r.status_code == 200
    body = r.json()
    assert len(body["items"]) == 2
    # latest first
    assert body["items"][0]["computed_at"] > body["items"][1]["computed_at"]


def test_admin_can_filter_snapshots_by_user():
    sb = SBStub(_seed_full())
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/persona/snapshots?user_id=user-1")
    assert r.status_code == 200
    assert all(s["user_id"] == "user-1" for s in r.json()["items"])


# ─── User inspector ───────────────────────────────────────────────────────
def test_admin_can_inspect_one_user():
    sb = SBStub(_seed_full())
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/persona/users/user-1")
    assert r.status_code == 200
    body = r.json()
    assert body["user_id"] == "user-1"
    assert body["latest_snapshot"]["id"] == "s1"
    assert len(body["recent_question_answers"]) == 1
    assert len(body["recent_signal_events"]) == 1
    assert len(body["queue_items"]) >= 1


def test_inspect_user_with_no_data_returns_empties():
    sb = SBStub(_seed_full())
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/persona/users/user-missing")
    assert r.status_code == 200
    body = r.json()
    assert body["latest_snapshot"] is None
    assert body["recent_question_answers"] == []
    assert body["recent_signal_events"] == []


# ─── Recompute ────────────────────────────────────────────────────────────
def test_recompute_user_enqueues_row():
    sb = SBStub({"persona_recompute_queue": []})
    client = TestClient(_build_app(sb))
    r = client.post(
        "/api/admin/persona/recompute-user",
        json={"user_id": "user-9", "reason": "admin_requested"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["queued"] is True
    assert body["user_id"] == "user-9"
    assert len(sb.db["persona_recompute_queue"]) == 1
    assert sb.db["persona_recompute_queue"][0]["status"] == "pending"


def test_recompute_user_requires_user_id():
    sb = SBStub({"persona_recompute_queue": []})
    client = TestClient(_build_app(sb))
    r = client.post(
        "/api/admin/persona/recompute-user",
        json={"reason": "admin_requested"},
    )
    assert r.status_code == 422  # pydantic validation


# ─── Queue ────────────────────────────────────────────────────────────────
def test_list_queue_default_returns_all_statuses():
    sb = SBStub(_seed_full())
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/persona/recompute-queue")
    assert r.status_code == 200
    statuses = {row["status"] for row in r.json()["items"]}
    assert {"pending", "completed", "failed"}.issubset(statuses)


def test_list_queue_status_filter():
    sb = SBStub(_seed_full())
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/persona/recompute-queue?status=failed")
    assert r.status_code == 200
    items = r.json()["items"]
    assert items and all(i["status"] == "failed" for i in items)


def test_list_queue_invalid_status_rejected():
    sb = SBStub(_seed_full())
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/persona/recompute-queue?status=nonsense")
    assert r.status_code == 400


# ─── Signal events ────────────────────────────────────────────────────────
def test_list_signal_events_filter_by_event_type():
    sb = SBStub(_seed_full())
    client = TestClient(_build_app(sb))
    r = client.get(
        "/api/admin/persona/signal-events?event_type=persona_question_answered"
    )
    assert r.status_code == 200
    items = r.json()["items"]
    assert items and all(
        i["event_type"] == "persona_question_answered" for i in items
    )


def test_list_signal_events_filter_by_user():
    sb = SBStub(_seed_full())
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/persona/signal-events?user_id=user-1")
    assert r.status_code == 200
    assert all(i["user_id"] == "user-1" for i in r.json()["items"])


def test_list_signal_events_filter_unprocessed_only():
    sb = SBStub(_seed_full())
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/persona/signal-events?processed=false")
    assert r.status_code == 200
    items = r.json()["items"]
    assert items and all(i["processed_at"] is None for i in items)
