"""Entitlement, lesson read, and progress write tests."""
from __future__ import annotations

from tests.marketplace._helpers import MktSBStub, client, seed_course, seed_lesson, seed_section


USER = {"id": "user-a", "email": "a@example.com"}


def test_preview_lesson_readable_without_enrollment():
    sb = MktSBStub()
    seed_course(sb, id="c1")
    seed_section(sb, course_id="c1", section_id="s1")
    seed_lesson(sb, section_id="s1", lesson_id="lp", is_preview=True, content_text="preview text")

    res = client(sb).get("/api/marketplace/resources/c1/lessons/lp")
    assert res.status_code == 200
    body = res.json()
    assert body["is_preview"] is True
    assert body["content_text"] == "preview text"


def test_locked_lesson_returns_403_without_enrollment():
    sb = MktSBStub()
    seed_course(sb, id="c1")
    seed_section(sb, course_id="c1", section_id="s1")
    seed_lesson(sb, section_id="s1", lesson_id="l1", is_preview=False)

    res = client(sb, user=USER).get("/api/marketplace/resources/c1/lessons/l1")
    assert res.status_code == 403


def test_enrolled_user_reads_locked_lesson():
    sb = MktSBStub()
    seed_course(sb, id="c1")
    seed_section(sb, course_id="c1", section_id="s1")
    seed_lesson(sb, section_id="s1", lesson_id="l1")
    sb.db.setdefault("enrollments", []).append({"id": "e1", "user_id": USER["id"], "course_id": "c1", "status": "active"})

    res = client(sb, user=USER).get("/api/marketplace/resources/c1/lessons/l1")
    assert res.status_code == 200
    assert res.json()["title"] == "Lesson 1"


def test_progress_write_requires_enrollment_and_upserts():
    sb = MktSBStub()
    seed_course(sb, id="c1")
    seed_section(sb, course_id="c1", section_id="s1")
    seed_lesson(sb, section_id="s1", lesson_id="l1")

    # No enrollment yet
    forbidden = client(sb, user=USER).put(
        "/api/marketplace/resources/c1/lessons/l1/progress",
        json={"completed": True, "percent": 100},
    )
    assert forbidden.status_code == 403

    sb.db.setdefault("enrollments", []).append({"id": "e1", "user_id": USER["id"], "course_id": "c1", "status": "active"})
    c = client(sb, user=USER)
    ok = c.put("/api/marketplace/resources/c1/lessons/l1/progress", json={"completed": True, "percent": 100, "watch_seconds": 42})
    assert ok.status_code == 200
    assert sb.db["lesson_progress"][0]["completed"] is True
    assert sb.db["lesson_progress"][0]["watch_seconds"] == 42
    # Re-write upserts
    c.put("/api/marketplace/resources/c1/lessons/l1/progress", json={"completed": True, "watch_seconds": 99})
    assert len(sb.db["lesson_progress"]) == 1
    assert sb.db["lesson_progress"][0]["watch_seconds"] == 99


def test_refunded_enrollment_loses_lesson_access():
    sb = MktSBStub()
    seed_course(sb, id="c1")
    seed_section(sb, course_id="c1", section_id="s1")
    seed_lesson(sb, section_id="s1", lesson_id="l1")
    sb.db.setdefault("enrollments", []).append({"id": "e1", "user_id": USER["id"], "course_id": "c1", "status": "refunded"})

    res = client(sb, user=USER).get("/api/marketplace/resources/c1/lessons/l1")
    assert res.status_code == 403

    access = client(sb, user=USER, optional_user=USER).get("/api/marketplace/resources/c1/access").json()
    assert access["state"] == "refunded"


def test_access_state_for_enrolled_user():
    sb = MktSBStub()
    seed_course(sb, id="c1")
    sb.db.setdefault("enrollments", []).append({"id": "e1", "user_id": USER["id"], "course_id": "c1", "status": "active"})
    access = client(sb, user=USER, optional_user=USER).get("/api/marketplace/resources/c1/access").json()
    assert access["state"] == "enrolled"
