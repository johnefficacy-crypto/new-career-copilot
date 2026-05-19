"""Tracked-exams endpoints — PR-C.

Covers ``GET /api/study/tracked-exams`` and ``DELETE /api/study/tracked-exams/{exam_id}``:
  * list reflects ``aspirant_preferences.target_exams`` slugs with the primary
    surfaced first and flagged ``is_primary: true``;
  * primary is included even if drift left it out of the slug list;
  * removing a non-primary exam drops the slug, leaves ``profiles.target_exam``
    unchanged;
  * removing the primary requires ``?confirm=true`` (409 otherwise) and
    clears ``profiles.target_exam`` on success.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import study_os as study_os_api
from app.core.auth import get_current_user
from tests.persona_questions._stub import SBStub


EXAM_A = "11111111-1111-4111-8111-111111111111"
EXAM_B = "22222222-2222-4222-8222-222222222222"


def _app(sb: SBStub, user_id: str = "u-1") -> FastAPI:
    app = FastAPI()
    app.include_router(study_os_api.router, prefix="/api")
    study_os_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    app.dependency_overrides[get_current_user] = lambda: {"id": user_id, "role": "user"}
    return app


def _seed_two_exams(primary: str | None = EXAM_A) -> SBStub:
    return SBStub(
        {
            "profiles": [{"id": "u-1", "target_exam": primary}],
            "aspirant_preferences": [
                {"id": "p-1", "user_id": "u-1", "target_exams": ["ssc-cgl", "upsc-cse"]}
            ],
            "exams": [
                {"id": EXAM_A, "slug": "ssc-cgl", "name": "SSC CGL", "is_active": True},
                {"id": EXAM_B, "slug": "upsc-cse", "name": "UPSC CSE", "is_active": True},
            ],
        }
    )


# ── GET /tracked-exams ────────────────────────────────────────────────────


def test_list_tracked_exams_returns_primary_first_and_flagged():
    body = TestClient(_app(_seed_two_exams())).get("/api/study/tracked-exams").json()
    assert body["primary_exam_id"] == EXAM_A
    slugs = [item["slug"] for item in body["items"]]
    assert slugs[0] == "ssc-cgl"  # primary first
    flags = {item["slug"]: item["is_primary"] for item in body["items"]}
    assert flags == {"ssc-cgl": True, "upsc-cse": False}


def test_list_tracked_exams_empty_when_no_preferences():
    sb = SBStub(
        {
            "profiles": [{"id": "u-1", "target_exam": None}],
            "aspirant_preferences": [],
            "exams": [],
        }
    )
    body = TestClient(_app(sb)).get("/api/study/tracked-exams").json()
    assert body == {"items": [], "primary_exam_id": None}


def test_list_tracked_exams_includes_primary_even_when_missing_from_slug_list():
    """Drift guard: an older user may have ``profiles.target_exam`` set
    but ``aspirant_preferences.target_exams`` empty. The primary must
    still appear in the response."""
    sb = SBStub(
        {
            "profiles": [{"id": "u-1", "target_exam": EXAM_A}],
            "aspirant_preferences": [
                {"id": "p-1", "user_id": "u-1", "target_exams": []}
            ],
            "exams": [
                {"id": EXAM_A, "slug": "ssc-cgl", "name": "SSC CGL", "is_active": True},
            ],
        }
    )
    body = TestClient(_app(sb)).get("/api/study/tracked-exams").json()
    assert [item["slug"] for item in body["items"]] == ["ssc-cgl"]
    assert body["items"][0]["is_primary"] is True


# ── DELETE /tracked-exams/{exam_id} ───────────────────────────────────────


def test_delete_non_primary_drops_slug_only():
    sb = _seed_two_exams()
    r = TestClient(_app(sb)).delete(f"/api/study/tracked-exams/{EXAM_B}")
    assert r.status_code == 200
    body = r.json()
    assert body["primary_cleared"] is False
    assert sb.db["aspirant_preferences"][0]["target_exams"] == ["ssc-cgl"]
    # Primary untouched.
    assert sb.db["profiles"][0]["target_exam"] == EXAM_A


def test_delete_primary_without_confirm_returns_409():
    sb = _seed_two_exams()
    r = TestClient(_app(sb)).delete(f"/api/study/tracked-exams/{EXAM_A}")
    assert r.status_code == 409
    detail = r.json().get("detail")
    assert isinstance(detail, dict)
    assert detail.get("code") == "PRIMARY_EXAM_REMOVAL_REQUIRES_CONFIRM"
    # Nothing changed.
    assert sb.db["profiles"][0]["target_exam"] == EXAM_A
    assert "ssc-cgl" in sb.db["aspirant_preferences"][0]["target_exams"]


def test_delete_primary_with_confirm_clears_primary_and_slug():
    sb = _seed_two_exams()
    r = TestClient(_app(sb)).delete(
        f"/api/study/tracked-exams/{EXAM_A}?confirm=true"
    )
    assert r.status_code == 200
    body = r.json()
    assert body["primary_cleared"] is True
    assert sb.db["profiles"][0]["target_exam"] is None
    assert "ssc-cgl" not in sb.db["aspirant_preferences"][0]["target_exams"]
    # The other tracked exam is preserved.
    assert sb.db["aspirant_preferences"][0]["target_exams"] == ["upsc-cse"]


def test_delete_unknown_exam_returns_404():
    sb = _seed_two_exams()
    missing = "99999999-9999-4999-8999-999999999999"
    r = TestClient(_app(sb)).delete(f"/api/study/tracked-exams/{missing}")
    assert r.status_code == 404
