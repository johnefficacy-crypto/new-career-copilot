"""PR2 — Recruitment detail security contract.

Exercises the extended GET /api/recruitments/{rec_ref} endpoint:
- Unpublished rows -> 404.
- user_id from client cannot override caller scoping.
- Caller A cannot see caller B's saved/eligibility overlay.
- sourceTrust normalised against the published Literal set.
- Detail works when eligibility row is absent.
"""
from __future__ import annotations

import asyncio

import pytest

from app.api import canonical


class Resp:
    def __init__(self, data):
        self.data = data


class Query:
    def __init__(self, rows):
        self.rows = rows
        self.filters: dict = {}
        self.in_filters: dict = {}
        self.ilike_calls: list = []

    def select(self, *a, **k):
        return self

    def in_(self, k, v):
        self.in_filters[k] = set(v)
        return self

    def eq(self, k, v):
        self.filters[k] = v
        return self

    def ilike(self, *a, **k):
        self.ilike_calls.append((a, k))
        return self

    def order(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def execute(self):
        out = list(self.rows)
        for k, v in self.in_filters.items():
            out = [r for r in out if r.get(k) in v]
        for k, v in self.filters.items():
            out = [r for r in out if r.get(k) == v]
        return Resp(out)


class SB:
    def __init__(self, *, recruitments=None, tracked=None, eligibility=None, exams=None):
        self._tables = {
            "recruitments": recruitments or [],
            "tracked_recruitments": tracked or [],
            "eligibility_results": eligibility or [],
            "exams": exams or [],
        }

    def table(self, name):
        return Query(self._tables.get(name, []))


def _rec(rid: str, slug: str, *, publish="published", source_url=None, posts=None, source_trust=None):
    return {
        "id": rid,
        "slug": slug,
        "name": f"Rec {slug}",
        "status": "open",
        "publish_status": publish,
        "apply_start_date": "2026-06-01",
        "apply_end_date": "2026-06-30",
        "notification_date": "2026-05-01",
        "total_vacancies": 10,
        "official_notification_url": source_url,
        "source_trust": source_trust,
        "exam_id": None,
        "organizations": {"id": "o1", "name": "Org", "type": "central", "state": None},
        "posts": posts or [
            {"post_name": "Officer", "vacancies": 5, "pay_level": "Level-7"},
        ],
        "recruitment_units": [],
    }


@pytest.fixture
def base_sb():
    return SB(
        recruitments=[
            _rec("11111111-1111-1111-1111-111111111111", "draft-rec", publish="draft"),
            _rec(
                "22222222-2222-2222-2222-222222222222",
                "published-rec",
                source_url="https://example.gov.in/notice.pdf",
            ),
        ],
        tracked=[
            {"user_id": "user-a", "recruitment_id": "22222222-2222-2222-2222-222222222222"},
        ],
        eligibility=[
            {
                "user_id": "user-a",
                "recruitment_id": "22222222-2222-2222-2222-222222222222",
                "is_eligible": True,
                "is_conditional": False,
                "fail_reasons": [],
                "computed_at": "2026-05-10T00:00:00+00:00",
            },
        ],
    )


def _user(uid: str):
    return {"id": uid, "is_anonymous": False}


def test_unpublished_returns_404(monkeypatch, base_sb):
    monkeypatch.setattr(canonical, "get_supabase_admin", lambda: base_sb)
    monkeypatch.setattr(canonical, "_safe", lambda call, default=None, **k: call())
    with pytest.raises(Exception) as exc:
        asyncio.run(canonical.get_recruitment("draft-rec", user=_user("user-a")))
    assert "404" in str(getattr(exc.value, "status_code", "")) or "not found" in str(exc.value).lower()


def test_user_a_cannot_see_user_b_eligibility(monkeypatch, base_sb):
    monkeypatch.setattr(canonical, "get_supabase_admin", lambda: base_sb)
    monkeypatch.setattr(canonical, "_safe", lambda call, default=None, **k: call())
    out_a = asyncio.run(canonical.get_recruitment("published-rec", user=_user("user-a")))
    out_b = asyncio.run(canonical.get_recruitment("published-rec", user=_user("user-b")))
    assert out_a["eligibility"]["state"] == "eligible"
    assert out_a["saved"] is True
    # user-b has no eligibility row + no saved → must not inherit A's overlay.
    assert out_b["eligibility"]["state"] == "not_yet"
    assert out_b["saved"] is False
    assert out_b["eligibility"]["userMatch"] == {"eligible": False, "conditional": False}


def test_source_trust_official_for_gov_url(monkeypatch, base_sb):
    monkeypatch.setattr(canonical, "get_supabase_admin", lambda: base_sb)
    monkeypatch.setattr(canonical, "_safe", lambda call, default=None, **k: call())
    out = asyncio.run(canonical.get_recruitment("published-rec", user=_user("user-a")))
    assert out["sourceTrust"] == "official"


def test_source_trust_out_of_set_coerced_to_low(monkeypatch):
    sb = SB(
        recruitments=[
            _rec(
                "33333333-3333-3333-3333-333333333333",
                "weird-trust",
                source_url="https://random-blog.example.com/post",
                source_trust="totally-bogus",
            ),
        ],
    )
    monkeypatch.setattr(canonical, "get_supabase_admin", lambda: sb)
    monkeypatch.setattr(canonical, "_safe", lambda call, default=None, **k: call())
    out = asyncio.run(canonical.get_recruitment("weird-trust", user=_user("user-a")))
    assert out["sourceTrust"] == "low"


def test_detail_works_with_eligibility_absent(monkeypatch):
    sb = SB(
        recruitments=[
            _rec("44444444-4444-4444-4444-444444444444", "no-elig", source_url=None),
        ],
        # No eligibility_results rows at all.
    )
    monkeypatch.setattr(canonical, "get_supabase_admin", lambda: sb)
    monkeypatch.setattr(canonical, "_safe", lambda call, default=None, **k: call())
    out = asyncio.run(canonical.get_recruitment("no-elig", user=_user("user-x")))
    assert out["eligibility"]["state"] == "not_yet"
    assert out["missingFields"] == []
    assert out["sourceTrust"] == "low"
    assert out["applyWindow"]["start"] == "2026-06-01"
    assert out["applyWindow"]["end"] == "2026-06-30"
    assert out["cta"]["url"] is None


def test_post_shape_camelcase(monkeypatch, base_sb):
    monkeypatch.setattr(canonical, "get_supabase_admin", lambda: base_sb)
    monkeypatch.setattr(canonical, "_safe", lambda call, default=None, **k: call())
    out = asyncio.run(canonical.get_recruitment("published-rec", user=_user("user-a")))
    posts = out["posts"]
    assert posts and set(posts[0].keys()) >= {"name", "vacancies", "payScale"}
    assert posts[0]["payScale"] == "Level-7"


def test_admin_only_fields_not_exposed(monkeypatch, base_sb):
    monkeypatch.setattr(canonical, "get_supabase_admin", lambda: base_sb)
    monkeypatch.setattr(canonical, "_safe", lambda call, default=None, **k: call())
    out = asyncio.run(canonical.get_recruitment("published-rec", user=_user("user-a")))
    for hidden in ("reviewer_notes", "raw_html", "extracted_data", "raw_snapshot_url", "raw_snapshot_hash", "field_evidence"):
        assert hidden not in out


def test_route_requires_auth():
    """The endpoint's `user` dependency must be the required (non-optional) auth."""
    import inspect

    from app.core import auth

    params = inspect.signature(canonical.get_recruitment).parameters
    dep = params["user"].default
    assert getattr(dep, "dependency", None) is auth.get_current_user
