"""Schema-truth contract for ``PATCH /api/admin/exam-intelligence/topic-coverage/{id}``.

Migration 030 (line 117) defines the column as ``review_notes`` on
``exam_topic_coverage``. Backend code had drifted to ``reviewer_notes``
and the resulting 42703 was being silently swallowed by ``_safe``.

This suite pins the corrected contract:
* ``review_notes`` is the only accepted key.
* ``reviewer_notes`` returns 422 (extra field forbidden) so a future
  regression surfaces immediately instead of silently dropping.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import admin_exam_intelligence as admin_module
from app.core.auth import get_current_user
from tests.persona_questions._stub import SBStub


def _seed_coverage_row() -> dict:
    return {
        "exam_topic_coverage": [
            {
                "id": "cov-1",
                "exam_id": "exam-1",
                "topic_id": "topic-1",
                "reviewer_status": "reviewed",
                "exam_priority_score": 70.0,
                "is_high_yield": False,
                "review_notes": None,
                "reviewed_by": None,
                "reviewed_at": None,
            }
        ]
    }


def _build_app(sb: SBStub) -> FastAPI:
    app = FastAPI()
    # router already carries the `/admin/exam-intelligence` prefix.
    app.include_router(admin_module.router, prefix="/api")
    admin_module.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    # ``require_permission(ADMIN_PERM)`` cascades through ``get_current_user``;
    # overriding the upstream dep lets every route see a super_admin.
    app.dependency_overrides[get_current_user] = lambda: {
        "id": "admin-1",
        "role": "super_admin",
        "permissions": [admin_module.ADMIN_PERM],
    }
    return app


def test_patch_with_review_notes_persists():
    sb = SBStub(_seed_coverage_row())
    client = TestClient(_build_app(sb))
    r = client.patch(
        "/api/admin/exam-intelligence/topic-coverage/cov-1",
        json={"review_notes": "syllabus aligned with Sep 2025 revision"},
    )
    assert r.status_code == 200, r.text
    row = sb.db["exam_topic_coverage"][0]
    assert row["review_notes"] == "syllabus aligned with Sep 2025 revision"
    # Audit fields populated.
    assert row["reviewed_by"] == "admin-1"
    assert row["reviewed_at"] is not None


def test_patch_with_legacy_reviewer_notes_returns_422():
    """Regression guard: the old, drifted column name must NOT silently
    succeed. ``extra="forbid"`` on the body schema rejects it before any
    SQL is issued so we never hit 42703 again.
    """
    sb = SBStub(_seed_coverage_row())
    client = TestClient(_build_app(sb))
    r = client.patch(
        "/api/admin/exam-intelligence/topic-coverage/cov-1",
        json={"reviewer_notes": "would have silently been swallowed"},
    )
    assert r.status_code == 422, r.text
    body = r.json()
    # Pydantic v2 surfaces the field name in the validation error.
    assert any(
        "reviewer_notes" in str(err) for err in body.get("detail", [])
    ), body


def test_patch_with_no_fields_returns_400():
    sb = SBStub(_seed_coverage_row())
    client = TestClient(_build_app(sb))
    r = client.patch(
        "/api/admin/exam-intelligence/topic-coverage/cov-1",
        json={},
    )
    assert r.status_code == 400, r.text


def test_patch_does_not_persist_legacy_key_under_any_circumstance():
    """Belt and suspenders. The full DB row after a successful PATCH must
    never carry a ``reviewer_notes`` key, even if some upstream caller
    forgets to migrate. We assert on the persisted row, not the response.
    """
    sb = SBStub(_seed_coverage_row())
    client = TestClient(_build_app(sb))
    r = client.patch(
        "/api/admin/exam-intelligence/topic-coverage/cov-1",
        json={"review_notes": "ok"},
    )
    assert r.status_code == 200, r.text
    row = sb.db["exam_topic_coverage"][0]
    assert "reviewer_notes" not in row
