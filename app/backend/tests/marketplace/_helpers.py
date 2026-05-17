"""Shared fixtures for marketplace API tests.

Builds a FastAPI app mounting the marketplace + admin marketplace routers,
swaps in the persona_questions ``SBStub`` for Supabase, and overrides the
auth dependency so each test can pick a user.
"""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import admin_marketplace as admin_mkt_api
from app.api import marketplace as mkt_api
from app.core.auth import get_current_user, get_optional_user
from app.payments import razorpay_client
from tests.persona_questions._stub import SBStub, _Query


class _LessonQuery(_Query):
    """Lessons read path hydrates the inner ``course_sections`` join."""

    def execute(self):
        result = super().execute()
        if isinstance(result.data, list):
            sections = self.db.get("course_sections", [])
            section_by_id = {s["id"]: s for s in sections}
            hydrated = []
            for row in result.data:
                section = section_by_id.get(row.get("section_id"))
                hydrated.append({**row, "course_sections": dict(section) if section else None})
            result.data = hydrated
        return result


class MktSBStub(SBStub):
    def table(self, name: str):
        if name == "lessons":
            return _LessonQuery(name, self.db)
        return super().table(name)


def build_app(sb, *, user: dict | None = None, optional_user: dict | None = None) -> FastAPI:
    app = FastAPI()
    app.include_router(mkt_api.router, prefix="/api")
    app.include_router(admin_mkt_api.router, prefix="/api")
    mkt_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    admin_mkt_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]

    if user is not None:
        app.dependency_overrides[get_current_user] = lambda: user

    # Default optional_user resolves to ``user`` when authenticated tests pass one.
    if optional_user is None:
        optional_user = user
    app.dependency_overrides[get_optional_user] = lambda: optional_user
    return app


def client(sb, *, user: dict | None = None, optional_user: dict | None = None) -> TestClient:
    return TestClient(build_app(sb, user=user, optional_user=optional_user))


def seed_course(sb, **overrides) -> dict:
    course = {
        "id": overrides.get("id", "course-1"),
        "title": "Test Course",
        "slug": "test-course",
        "price_inr": 1000,
        "status": "published",
        "instructor_id": "instructor-1",
        "level": "all",
        "language": "Hindi",
        "exam_tags": [],
        "total_lessons": 0,
        "total_duration_mins": 0,
        "total_enrollments": 0,
        "total_reviews": 0,
        "commission_pct": 20,
        "refund_window_days": 7,
        "is_affiliate": False,
        "affiliate_disclosure": None,
        "description": None,
        "short_description": None,
        "thumbnail_url": None,
        "avg_rating": None,
        "updated_at": "2026-01-01T00:00:00+00:00",
    }
    course.update(overrides)
    sb.db.setdefault("courses", []).append(course)
    return course


def seed_section(sb, *, course_id: str, section_id: str = "section-1", title: str = "Module 1") -> dict:
    row = {"id": section_id, "course_id": course_id, "title": title, "order_index": 0}
    sb.db.setdefault("course_sections", []).append(row)
    return row


def seed_lesson(sb, *, section_id: str, lesson_id: str = "lesson-1", is_preview: bool = False, **overrides) -> dict:
    row = {
        "id": lesson_id,
        "section_id": section_id,
        "title": "Lesson 1",
        "type": "text",
        "duration_mins": 10,
        "order_index": 0,
        "is_free_preview": is_preview,
        "content_url": None,
        "content_text": "Lesson body",
    }
    row.update(overrides)
    sb.db.setdefault("lessons", []).append(row)
    return row


def patch_razorpay(monkeypatch, *, valid_signature: bool = True, valid_webhook: bool = True, order_id: str = "rzp_order_1", refund_ok: bool = True):
    monkeypatch.setattr(razorpay_client, "verify_signature", lambda *_args, **_k: valid_signature)
    monkeypatch.setattr(razorpay_client, "verify_webhook_signature", lambda *_args, **_k: valid_webhook)
    monkeypatch.setattr(razorpay_client, "get_public_key_id", lambda: "rzp_test_key")

    def _order(amount_inr: int, receipt: str, notes: dict[str, Any] | None = None) -> dict[str, Any]:
        return {"id": order_id, "amount": amount_inr * 100, "currency": "INR", "receipt": receipt, "notes": notes or {}}

    monkeypatch.setattr(razorpay_client, "create_order", _order)

    def _refund(payment_id: str, amount_inr: int, notes: dict[str, Any] | None = None) -> dict[str, Any]:
        if not refund_ok:
            from fastapi import HTTPException
            raise HTTPException(status_code=502, detail="Razorpay refund failed")
        return {"id": f"rfnd_{payment_id}", "amount": amount_inr * 100, "status": "processed"}

    monkeypatch.setattr(razorpay_client, "refund", _refund)
