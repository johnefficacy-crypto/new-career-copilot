"""Tests for the admin Operations Console backend additions (Phases 6-11).

These exercise the smaller surfaces that back the new UI without needing a
real Supabase: nested-field patch parsing, resolve-official-source rules,
merge-preview decisions, criteria-editor validation, eligibility-ops shape,
and the normalizer clamp.
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.api import admin_scrape, admin_trust
from app.scraping.normalizer import normalize_recruitment
from app.scraping.schemas import ExtractedPost, ExtractedRecruitment


# ── Phase 6: data quality score clamp ───────────────────────────────────────


def test_data_quality_score_clamped_to_one():
    """Even a fully-described recruitment must not score above 1.0."""
    fully = ExtractedPost(
        post_name="X", min_age=18, max_age=32,
        education_required="bachelor", vacancies=10,
    )
    out = normalize_recruitment(
        ExtractedRecruitment(
            title="T",
            organization_name="Org",
            org_type="central",
            year=2026,
            apply_end_date="2026-12-31",
            total_vacancies=10,
            official_notification_url="https://x.gov/n",
            posts=[fully],
        )
    )
    assert out.data_quality_score <= 1.0


# ── Phase 7: nested field path parsing ──────────────────────────────────────


def test_parse_field_path_accepts_flat_key():
    assert admin_scrape._parse_field_path("apply_end_date") == ["apply_end_date"]


def test_parse_field_path_accepts_nested_post_field():
    assert admin_scrape._parse_field_path("posts.0.min_age") == ["posts", 0, "min_age"]
    assert admin_scrape._parse_field_path("posts.10.education_required") == ["posts", 10, "education_required"]


@pytest.mark.parametrize("bad", ["", "posts..0", "posts/0", "posts.0.", "..", "posts.-1.x", "drop;table"])
def test_parse_field_path_rejects_malformed(bad):
    with pytest.raises(HTTPException) as exc:
        admin_scrape._parse_field_path(bad)
    assert exc.value.status_code == 422


def test_nested_set_mutates_post_field_in_place():
    data = {"posts": [{"post_name": "A"}, {"post_name": "B"}]}
    admin_scrape._nested_set(data, ["posts", 1, "min_age"], 21)
    assert data["posts"][1] == {"post_name": "B", "min_age": 21}
    # Other post untouched.
    assert data["posts"][0] == {"post_name": "A"}


def test_nested_set_refuses_out_of_range_index():
    data = {"posts": [{"post_name": "A"}]}
    with pytest.raises(HTTPException) as exc:
        admin_scrape._nested_set(data, ["posts", 5, "min_age"], 21)
    assert exc.value.status_code == 422


# ── Phase 8: resolve-official-source rules ──────────────────────────────────


class _R:
    def __init__(self, data=None, count=None):
        self.data = data
        self.count = count


class _Q:
    def __init__(self, table, state):
        self.table = table
        self.state = state
        self._filter = {}
        self._payload = None

    def select(self, *a, **k):
        return self

    def eq(self, k, v):
        self._filter[k] = v
        return self

    def limit(self, *a, **k):
        return self

    def update(self, payload):
        self._payload = payload
        return self

    def insert(self, payload):
        self._payload = payload
        self.state.setdefault("inserts", {}).setdefault(self.table, []).append(payload)
        return self

    def execute(self):
        if self.table == "scrape_queue":
            rows = [r for r in self.state.get("queue", []) if r.get("id") == self._filter.get("id", r.get("id"))]
            if self._payload and rows:
                rows[0].update(self._payload)
            return _R(rows)
        if self.table == "source_registry":
            rows = [s for s in self.state.get("sources", []) if s.get("id") == self._filter.get("id", s.get("id"))]
            return _R(rows)
        if self.table == "admin_audit_logs":
            self.state.setdefault("audits", []).append(self._payload)
            return _R([{}])
        if self.table == "recruitments":
            rows = [r for r in self.state.get("recruitments", []) if r.get("id") == self._filter.get("id", r.get("id"))]
            if self._payload and rows:
                rows[0].update(self._payload)
            return _R(rows)
        if self.table == "extracted_field_evidence":
            qid = self._filter.get("scrape_queue_id")
            rows = [r for r in self.state.get("evidence", []) if r.get("scrape_queue_id") == qid]
            return _R(rows)
        return _R([])


class _SB:
    def __init__(self, state):
        self.state = state

    def table(self, name):
        return _Q(name, self.state)


def _admin():
    return {"id": "admin-1", "email": "a@x", "role": "admin"}


def _resolve_body(**overrides):
    body = {
        "source_id": "src-1",
        "official_notification_url": "https://gov.in/n",
        "official_apply_url": "https://gov.in/apply",
        "source_pdf_url": None,
        "notes": "ok",
    }
    body.update(overrides)
    return admin_scrape.ResolveOfficialSourceBody(**body)


def test_resolve_official_source_flips_gate_for_verified_source(monkeypatch):
    state = {
        "queue": [{"id": "q1", "source_id": None, "extracted_data": {"title": "t"}, "status": "pending"}],
        "sources": [{
            "id": "src-1",
            "source_name": "Gov source",
            "source_type": "official_html",
            "is_verified": True,
            "discovery_only": False,
            "is_active": True,
            "official_url": "https://gov.in",
        }],
        "audits": [],
    }
    monkeypatch.setattr(admin_scrape, "get_supabase_admin", lambda: _SB(state))

    result = admin_scrape.resolve_official_source_for_queue_item(
        "q1", _resolve_body(), admin=_admin(),
    )
    assert result["ok"] is True
    assert result["official_source_resolved"] is True
    assert result["source_id"] == "src-1"
    assert state["queue"][0]["official_source_resolved"] is True
    assert state["queue"][0]["source_id"] == "src-1"
    assert state["queue"][0]["extracted_data"]["official_notification_url"] == "https://gov.in/n"
    assert any(a.get("action") == "scrape.queue.resolve_official_source" for a in state["audits"])


def test_resolve_official_source_rejects_aggregator(monkeypatch):
    state = {
        "queue": [{"id": "q1", "source_id": None, "extracted_data": {}, "status": "pending"}],
        "sources": [{
            "id": "src-1", "source_type": "aggregator", "is_verified": False,
            "discovery_only": True, "is_active": True,
        }],
        "audits": [],
    }
    monkeypatch.setattr(admin_scrape, "get_supabase_admin", lambda: _SB(state))
    with pytest.raises(HTTPException) as exc:
        admin_scrape.resolve_official_source_for_queue_item("q1", _resolve_body(), admin=_admin())
    assert exc.value.status_code == 409


def test_resolve_official_source_rejects_unverified(monkeypatch):
    state = {
        "queue": [{"id": "q1", "source_id": None, "extracted_data": {}, "status": "pending"}],
        "sources": [{
            "id": "src-1", "source_type": "official_html", "is_verified": False,
            "discovery_only": False, "is_active": True,
        }],
        "audits": [],
    }
    monkeypatch.setattr(admin_scrape, "get_supabase_admin", lambda: _SB(state))
    with pytest.raises(HTTPException) as exc:
        admin_scrape.resolve_official_source_for_queue_item("q1", _resolve_body(), admin=_admin())
    assert exc.value.status_code == 409


# ── Phase 9: merge preview decisions ────────────────────────────────────────


def test_merge_preview_marks_existing_value_force_available(monkeypatch):
    state = {
        "queue": [{"id": "q1", "source_id": "src-1", "extracted_data": {
            "official_notification_url": "https://gov.in/new",
            "apply_end_date": "2026-12-31",
        }}],
        "recruitments": [{
            "id": "rec-1",
            "official_notification_url": "https://gov.in/old",
            "apply_end_date": None,
            "source_id": "src-old",
        }],
        "evidence": [],
    }
    monkeypatch.setattr(admin_scrape, "get_supabase_admin", lambda: _SB(state))
    result = admin_scrape.merge_preview("q1", "rec-1", _admin=_admin())
    by_field = {row["field"]: row for row in result["fields"]}
    # Existing has a value, queue has a different value -> force_available
    assert by_field["official_notification_url"]["decision"] == "force_available"
    # Existing empty, queue has value -> update
    assert by_field["apply_end_date"]["decision"] == "update"
    # source_id reassignment is force_available because the existing rec has a source
    assert by_field["source_id"]["decision"] == "force_available"


def test_merge_preview_corrected_value_wins(monkeypatch):
    state = {
        "queue": [{"id": "q1", "source_id": "src-1", "extracted_data": {
            "official_notification_url": "https://gov.in/extracted",
        }}],
        "recruitments": [{
            "id": "rec-1", "official_notification_url": "https://gov.in/existing",
        }],
        "evidence": [{
            "scrape_queue_id": "q1",
            "field_name": "official_notification_url",
            "reviewer_status": "corrected",
            "corrected_value": "https://gov.in/admin-fixed",
        }],
    }
    monkeypatch.setattr(admin_scrape, "get_supabase_admin", lambda: _SB(state))
    result = admin_scrape.merge_preview("q1", "rec-1", _admin=_admin())
    by_field = {row["field"]: row for row in result["fields"]}
    row = by_field["official_notification_url"]
    # Even though existing has a value, a corrected value flips decision to update.
    assert row["decision"] == "update"
    assert row["effective_value"] == "https://gov.in/admin-fixed"
    assert row["reason"] == "corrected"


# ── Phase 10: criteria editor validation ────────────────────────────────────


def test_validate_age_body_rejects_min_above_max():
    with pytest.raises(HTTPException) as exc:
        admin_trust._validate_age_body({"min_age": 40, "max_age": 30})
    assert exc.value.status_code == 400


def test_validate_age_body_coerces_ints():
    payload = admin_trust._validate_age_body({"min_age": "18", "max_age": "30", "cutoff_date": "2026-01-01"})
    assert payload == {"min_age": 18, "max_age": 30, "cutoff_date": "2026-01-01"}


def test_validate_education_body_rejects_unknown_level():
    with pytest.raises(HTTPException) as exc:
        admin_trust._validate_education_body({"min_qualification_level": "wizard"})
    assert exc.value.status_code == 400


def test_validate_education_body_normalises_discipline_list():
    payload = admin_trust._validate_education_body({
        "min_qualification_level": "graduate",
        "allowed_disciplines": ["CSE", "ECE"],
    })
    assert payload["min_qualification_level"] == "graduate"
    assert payload["allowed_disciplines"] == {"primary": ["CSE", "ECE"]}


def test_validate_post_body_requires_post_name_when_present_but_blank():
    with pytest.raises(HTTPException):
        admin_trust._validate_post_body({"post_name": "   "})


# ── duplicate_candidates payload shape (Operations Console wiring) ──────────


def test_duplicate_candidates_returns_recruitment_id_not_id():
    """OperationsConsole.openMergePreview reads recruitment_id; if the
    backend ever ships an `id` field instead the merge-into call will hit
    `/.../merge-into/undefined` and 404. Lock the shape."""
    from app.scraping import intelligence

    existing = [{
        "id": "rec-existing",
        "name": "Inspector 2026",
        "year": 2026,
        "organizations": {"name": "SSC"},
        "official_notification_url": "https://gov.in/n",
    }]
    extracted = {
        "title": "Inspector 2026",
        "organization_name": "SSC",
        "year": 2026,
        "official_notification_url": "https://gov.in/n",
    }
    out = intelligence.duplicate_candidates(extracted, existing)
    assert out, "expected a duplicate match for identical recruitment"
    candidate = out[0]
    assert "recruitment_id" in candidate
    assert candidate["recruitment_id"] == "rec-existing"
    # Backward-compat: must not silently rename to `id` again.
    assert "id" not in candidate


# ── /api/admin/eligibility-ops fallback when tables are missing ─────────────


class _ExplodingQ:
    """Queue table that raises on every read; used to simulate missing
    eligibility_recompute_queue / eligibility_results tables."""

    def __init__(self, table, ok_tables=()):
        self.table = table
        self.ok = table in ok_tables

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def in_(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def execute(self):
        if not self.ok:
            raise RuntimeError(f"table {self.table} unavailable")
        return _R([], count=0)


def test_eligibility_ops_returns_zeros_when_tables_missing(monkeypatch):
    class _ExplodingSB:
        def table(self, name):
            # Only recruitments survives; the rest 500 to mirror the case
            # where eligibility_recompute_queue / eligibility_results have
            # not been migrated on a fresh deployment.
            return _ExplodingQ(name, ok_tables=("recruitments",))

    monkeypatch.setattr(admin_trust, "get_supabase_admin", lambda: _ExplodingSB())
    result = admin_trust.eligibility_ops(_admin=_admin())
    # Every numeric counter must be 0 (not missing) and the failed_rows
    # list must be empty so the page renders without crashing on a fresh
    # deployment where the recompute tables don't exist yet.
    assert result == {
        "pending_recomputes": 0,
        "failed_recomputes": 0,
        "queued": 0,
        "processing": 0,
        "processed": 0,
        "stale_results": 0,
        "published_awaiting": 0,
        "failed_rows": [],
        "onboarded_users": 0,
    }


# ── admin_recruitments shape: editable fields exposed to the console ────────


def test_admin_recruitments_exposes_inline_editor_fields(monkeypatch):
    """Inline RecruitmentBlockerFixForm reads organization_id, source_id,
    apply_start_date, apply_end_date, total_vacancies, review_notes. The
    admin_recruitments list must include them so the form can pre-fill
    without an extra GET /api/admin/recruitments/{id}."""
    state = {
        "recruitments_list": [{
            "id": "rec-1",
            "name": "Inspector 2026",
            "publish_status": "needs_review",
            "status": "open",
            "organization_id": "org-1",
            "source_id": "src-1",
            "official_notification_url": "https://gov.in/n",
            "official_apply_url": "https://gov.in/apply",
            "source_pdf_url": None,
            "apply_start_date": "2026-01-01",
            "apply_end_date": "2026-02-01",
            "notification_date": "2025-12-15",
            "total_vacancies": 100,
            "published_by": None,
            "published_at": None,
            "review_notes": "verified by admin",
            "organizations": {"name": "SSC", "is_verified": True},
        }],
    }

    class _RecQ:
        def __init__(self, table):
            self.table = table

        def select(self, *a, **k):
            return self

        def order(self, *a, **k):
            return self

        def limit(self, *a, **k):
            return self

        def eq(self, *a, **k):
            return self

        def in_(self, *a, **k):
            return self

        def execute(self):
            if self.table == "recruitments":
                return _R(state["recruitments_list"])
            return _R([])

    class _RecSB:
        def table(self, name):
            return _RecQ(name)

    monkeypatch.setattr(admin_trust, "get_supabase_admin", lambda: _RecSB())
    # validate_recruitment_publish_readiness uses the same supabase; let it
    # short-circuit by returning the same row shape it expects.
    monkeypatch.setattr(
        admin_trust,
        "validate_recruitment_publish_readiness",
        lambda rec_id, admin: {"blocking_issues": [], "warnings": []},
    )
    result = admin_trust.admin_recruitments(_admin=_admin())
    assert result["items"], "expected one recruitment row"
    row = result["items"][0]
    for field in (
        "organization_id",
        "source_id",
        "apply_start_date",
        "apply_end_date",
        "notification_date",
        "total_vacancies",
        "review_notes",
        "source_pdf_url",
    ):
        assert field in row, f"missing inline-editor field {field}"
    assert row["organization_id"] == "org-1"
    assert row["apply_end_date"] == "2026-02-01"
    assert row["total_vacancies"] == 100
