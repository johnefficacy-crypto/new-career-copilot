import asyncio

import pytest
from fastapi import HTTPException

from app.api import admin_trust, canonical


class R:
    def __init__(self, data=None):
        self.data = data or []


class Q:
    def __init__(self, table, store):
        self.table = table
        self.store = store
        self.filters = {}
        self.in_filters = {}
        self.payload = None

    def select(self, *a, **k):
        return self

    def eq(self, key, value):
        self.filters[key] = value
        return self

    def in_(self, key, values):
        self.in_filters[key] = set(values)
        return self

    def order(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def insert(self, payload):
        self.payload = payload
        return self

    def update(self, payload):
        self.payload = payload
        return self

    def execute(self):
        if self.table == "admin_audit_logs":
            self.store.setdefault("admin_audit_logs", []).append(self.payload or {})
            return R([self.payload or {}])
        rows = [dict(r) for r in self.store.get(self.table, [])]
        for key, value in self.filters.items():
            rows = [r for r in rows if r.get(key) == value]
        for key, values in self.in_filters.items():
            rows = [r for r in rows if r.get(key) in values]
        if self.payload and self.table in self.store:
            for row in self.store[self.table]:
                if all(row.get(k) == v for k, v in self.filters.items()):
                    row.update(self.payload)
            rows = [dict(r) for r in self.store.get(self.table, [])]
            for key, value in self.filters.items():
                rows = [r for r in rows if r.get(key) == value]
        return R(rows)


class SB:
    def __init__(self, rec_override=None, *, org_verified=True, source_verified=True, age_rows=None, edu_rows=None):
        rec = {
            "id": "r1",
            "slug": "golden",
            "name": "Golden Recruitment",
            "organization_id": "o1",
            "organizations": {"name": "Org", "is_verified": org_verified},
            "source_id": "s1",
            "official_notification_url": "https://example.gov/notice",
            "official_apply_url": "https://example.gov/apply",
            "status": "open",
            "publish_status": "needs_review",
            "apply_start_date": "2026-05-01",
            "apply_end_date": "2026-06-01",
            "posts": [{"id": "p1"}],
        }
        rec.update(rec_override or {})
        self.store = {
            "recruitments": [rec],
            "source_registry": [{"id": "s1", "is_verified": source_verified, "verification_status": "verified" if source_verified else "needs_review"}],
            "age_criteria": age_rows if age_rows is not None else [{"id": "a1", "post_id": "p1"}],
            "education_criteria": edu_rows if edu_rows is not None else [{"id": "e1", "post_id": "p1"}],
            "admin_audit_logs": [],
        }

    def table(self, name):
        return Q(name, self.store)


def _install(monkeypatch, sb):
    monkeypatch.setattr(admin_trust, "get_supabase_admin", lambda: sb)


def test_needs_review_visible_admin_hidden_public(monkeypatch):
    sb = SB()
    _install(monkeypatch, sb)
    monkeypatch.setattr(canonical, "get_supabase_admin", lambda: sb)
    monkeypatch.setattr(canonical, "_safe", lambda call, default=None: call())

    assert admin_trust.admin_recruitments({"id": "a"})["items"][0]["id"] == "r1"
    out = asyncio.run(canonical.list_recruitments(status=None, q=None, user=None))
    assert out["items"] == []


def test_publish_blocked_when_organization_unverified(monkeypatch):
    sb = SB(org_verified=False)
    _install(monkeypatch, sb)

    with pytest.raises(HTTPException) as exc:
        admin_trust.publish_recruitment("r1", {"id": "a"})

    assert exc.value.status_code == 409
    assert "organization_unverified" in exc.value.detail["blocking_issues"]
    assert sb.store["recruitments"][0]["publish_status"] == "needs_review"


def test_publish_blocked_when_source_provenance_missing(monkeypatch):
    sb = SB({"source_id": None})
    _install(monkeypatch, sb)

    with pytest.raises(HTTPException) as exc:
        admin_trust.publish_recruitment("r1", {"id": "a"})

    assert "source_provenance_missing" in exc.value.detail["blocking_issues"]


def test_publish_blocked_when_source_unverified(monkeypatch):
    sb = SB(source_verified=False)
    _install(monkeypatch, sb)

    with pytest.raises(HTTPException) as exc:
        admin_trust.publish_recruitment("r1", {"id": "a"})

    assert "unverified_source_provenance" in exc.value.detail["blocking_issues"]


def test_publish_blocked_when_official_notification_url_missing(monkeypatch):
    sb = SB({"official_notification_url": None})
    _install(monkeypatch, sb)

    with pytest.raises(HTTPException) as exc:
        admin_trust.publish_recruitment("r1", {"id": "a"})

    assert "official_notification_url_missing" in exc.value.detail["blocking_issues"]


def test_publish_blocked_when_posts_missing(monkeypatch):
    sb = SB({"posts": []})
    _install(monkeypatch, sb)

    ready = admin_trust.validate_recruitment_publish_readiness("r1", {"id": "a"})

    assert "posts_missing" in ready["blocking_issues"]


def test_publish_blocked_when_eligibility_rules_missing(monkeypatch):
    sb = SB(age_rows=[], edu_rows=[])
    _install(monkeypatch, sb)

    ready = admin_trust.validate_recruitment_publish_readiness("r1", {"id": "a"})

    assert "eligibility_rules_missing" in ready["blocking_issues"]


def test_publish_succeeds_only_when_trusted_and_rules_exist(monkeypatch):
    sb = SB()
    _install(monkeypatch, sb)

    out = admin_trust.publish_recruitment("r1", {"id": "a", "email": "a@example.test"})

    assert out["ok"] is True
    assert sb.store["recruitments"][0]["publish_status"] == "published"
    assert sb.store["recruitments"][0]["published_by"] == "a"
    assert any(a.get("action") == "recruitment.publish" for a in sb.store["admin_audit_logs"])


def test_critical_edit_to_published_recruitment_resets_needs_review(monkeypatch):
    sb = SB({"publish_status": "published", "total_vacancies": 10})
    _install(monkeypatch, sb)

    admin_trust.update_recruitment("r1", {"total_vacancies": 11}, {"id": "a"})

    assert sb.store["recruitments"][0]["publish_status"] == "needs_review"
