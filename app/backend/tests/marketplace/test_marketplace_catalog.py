"""Catalogue read tests for the marketplace API."""
from __future__ import annotations

from tests.marketplace._helpers import MktSBStub, client, seed_course, seed_section, seed_lesson


def test_published_visible_in_resources():
    sb = MktSBStub()
    seed_course(sb, id="c1", title="Visible", status="published")
    seed_course(sb, id="c2", title="Hidden", status="draft")
    c = client(sb)
    res = c.get("/api/marketplace/resources").json()
    titles = [r["title"] for r in res["items"]]
    assert "Visible" in titles
    assert "Hidden" not in titles


def test_resource_detail_serves_published_only():
    sb = MktSBStub()
    seed_course(sb, id="c1", title="Published", status="published", price_inr=999)
    seed_course(sb, id="c2", title="Draft", status="draft")
    seed_section(sb, course_id="c1", section_id="s1")
    seed_lesson(sb, section_id="s1", lesson_id="l1")

    c = client(sb)
    pub = c.get("/api/marketplace/resources/c1")
    assert pub.status_code == 200
    body = pub.json()
    assert body["title"] == "Published"
    assert body["price_inr"] == 999
    assert body["refund_window_days"] == 7

    draft = c.get("/api/marketplace/resources/c2")
    assert draft.status_code == 404


def test_providers_only_lists_instructors_with_published_courses():
    sb = MktSBStub()
    sb.db["profiles"] = [
        {"id": "p1", "full_name": "Active", "is_instructor": True,
         "courses": [{"id": "c1", "exam_tags": ["UPSC"], "avg_rating": 4.5, "status": "published"}]},
        {"id": "p2", "full_name": "DraftOnly", "is_instructor": True,
         "courses": [{"id": "c2", "exam_tags": [], "avg_rating": None, "status": "draft"}]},
    ]
    res = client(sb).get("/api/marketplace/providers").json()
    names = [p["name"] for p in res["items"]]
    assert "Active" in names
    assert "DraftOnly" not in names


def test_affiliates_lists_disclosed_courses():
    sb = MktSBStub()
    seed_course(sb, id="ca", title="Affiliate", status="published", is_affiliate=True,
                affiliate_disclosure="We earn 10%")
    seed_course(sb, id="cb", title="Plain", status="published", is_affiliate=False)
    res = client(sb).get("/api/marketplace/affiliates").json()
    names = [a["name"] for a in res["items"]]
    assert "Affiliate" in names
    assert "Plain" not in names
