"""Tests for the consensus conflict resolver (migration 087).

Covers the four ``admin_conflicts`` endpoints plus the promotion gate's
new "open conflict" block in :func:`promote_to_recruitments`. The mock
Supabase mirrors the same shape used by other admin endpoint tests so
new mutations don't drift from the production query patterns.
"""
from __future__ import annotations

from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import admin_conflicts as admin_conflicts_api
from app.core.auth import get_current_user
from app.scraping import runner as scrape_runner
from tests.persona_questions._stub import SBStub


ADMIN_USER = {
    "id": "admin-1",
    "email": "admin@example.com",
    "role": "super_admin",
    "permissions": [],
}

USER_USER = {
    "id": "user-1",
    "email": "user@example.com",
    "role": "user",
    "permissions": [],
}


# ─── App fixture ──────────────────────────────────────────────────────────


def _build_app(sb: SBStub, *, user: dict = ADMIN_USER) -> FastAPI:
    app = FastAPI()
    app.include_router(admin_conflicts_api.router, prefix="/api")
    admin_conflicts_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    app.dependency_overrides[get_current_user] = lambda: user
    return app


# ─── Seeds ────────────────────────────────────────────────────────────────


def _seed_two_conflicts() -> SBStub:
    sb = SBStub({
        "scrape_queue": [{
            "id": "queue-1",
            "status": "pending",
            "official_source_resolved": True,
            "extracted_data": {
                "title": "UPSC 2026",
                "apply_end_date": "2026-06-30",
                "total_vacancies": 100,
            },
        }],
        "recruitment_verification_conflicts": [
            {
                "id": "conflict-1",
                "queue_id": "queue-1",
                "recruitment_id": None,
                "field_key": "apply_end_date",
                "status": "open",
                "candidates": [
                    {
                        "source_url": "https://upsc.gov.in/notice.pdf",
                        "source_kind": "notification_pdf",
                        "value": "2026-06-30",
                        "extracted_at": "2026-05-01T10:00:00Z",
                    },
                    {
                        "source_url": "https://upsc.gov.in/corrigendum.pdf",
                        "source_kind": "corrigendum_pdf",
                        "value": "2026-07-15",
                        "extracted_at": "2026-05-10T10:00:00Z",
                    },
                ],
                "created_at": "2026-05-11T10:00:00Z",
            },
            {
                "id": "conflict-2",
                "queue_id": "queue-1",
                "recruitment_id": None,
                "field_key": "total_vacancies",
                "status": "open",
                "candidates": [
                    {
                        "source_url": "https://upsc.gov.in/notice.pdf",
                        "source_kind": "notification_pdf",
                        "value": 100,
                        "extracted_at": "2026-05-01T10:00:00Z",
                    },
                    {
                        "source_url": "https://sarkarijobs.example/listing",
                        "source_kind": "aggregator",
                        "value": 120,
                        "extracted_at": "2026-05-02T10:00:00Z",
                    },
                ],
                "created_at": "2026-05-11T10:00:00Z",
            },
        ],
        "admin_audit_logs": [],
    })
    return sb


# ─── 1 · fixture sanity ───────────────────────────────────────────────────


def test_seed_fixture_holds_one_official_and_one_aggregator_conflict():
    sb = _seed_two_conflicts()
    rows = sb.db["recruitment_verification_conflicts"]
    assert len(rows) == 2
    assert {r["field_key"] for r in rows} == {"apply_end_date", "total_vacancies"}
    assert {r["status"] for r in rows} == {"open"}
    # Conflict 1 is official-vs-official (two government PDFs).
    conflict1 = next(r for r in rows if r["id"] == "conflict-1")
    kinds1 = {c["source_kind"] for c in conflict1["candidates"]}
    assert kinds1 == {"notification_pdf", "corrigendum_pdf"}
    # Conflict 2 mixes an official notification with an aggregator listing.
    conflict2 = next(r for r in rows if r["id"] == "conflict-2")
    kinds2 = {c["source_kind"] for c in conflict2["candidates"]}
    assert "aggregator" in kinds2


# ─── 2 · list ─────────────────────────────────────────────────────────────


def test_list_open_conflicts_returns_both_for_queue():
    sb = _seed_two_conflicts()
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/scrape/items/queue-1/conflicts")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 2
    ids = {c["id"] for c in body["items"]}
    statuses = {c["status"] for c in body["items"]}
    assert ids == {"conflict-1", "conflict-2"}
    assert statuses == {"open"}


# ─── 3 · happy-path resolve ───────────────────────────────────────────────


def test_resolve_conflict_updates_status_audit_and_queue_payload():
    sb = _seed_two_conflicts()
    client = TestClient(_build_app(sb))

    payload = {
        "value": "2026-07-15",
        "scope": "field",
        "reason": "Corrigendum supersedes notification per official desk-note.",
        "evidence_url": "https://upsc.gov.in/corrigendum.pdf",
    }
    r = client.post("/api/admin/conflicts/conflict-1/resolve", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["conflict"]["status"] == "resolved_by_admin"
    assert body["conflict"]["resolved_value"] == "2026-07-15"
    assert body["conflict"]["resolved_scope"] == "field"
    assert body["conflict"]["resolved_by"] == ADMIN_USER["id"]

    # Conflict row mutated in place.
    stored = next(
        c for c in sb.db["recruitment_verification_conflicts"] if c["id"] == "conflict-1"
    )
    assert stored["status"] == "resolved_by_admin"
    assert stored["resolved_value"] == "2026-07-15"

    # extracted_data on the scrape_queue patched with chosen value.
    queue_row = sb.db["scrape_queue"][0]
    assert queue_row["extracted_data"]["apply_end_date"] == "2026-07-15"

    # Audit row written with the request payload + updated conflict.
    audits = sb.db["admin_audit_logs"]
    assert len(audits) == 1
    audit = audits[0]
    assert audit["action"] == "conflict.resolve"
    assert audit["entity_id"] == "conflict-1"
    assert audit["new_value"]["request"]["scope"] == "field"


# ─── 4 · validation: reason < 10 chars ────────────────────────────────────


def test_resolve_rejects_short_reason():
    sb = _seed_two_conflicts()
    client = TestClient(_build_app(sb))
    r = client.post(
        "/api/admin/conflicts/conflict-1/resolve",
        json={
            "value": "2026-07-15",
            "scope": "field",
            "reason": "too short",
            "evidence_url": "https://upsc.gov.in/corrigendum.pdf",
        },
    )
    assert r.status_code == 400
    assert "reason" in (r.json().get("detail") or "").lower()
    # No mutation on the conflict row.
    stored = next(
        c for c in sb.db["recruitment_verification_conflicts"] if c["id"] == "conflict-1"
    )
    assert stored["status"] == "open"


# ─── 5 · validation: invalid URL ──────────────────────────────────────────


def test_resolve_rejects_invalid_evidence_url():
    sb = _seed_two_conflicts()
    client = TestClient(_build_app(sb))
    r = client.post(
        "/api/admin/conflicts/conflict-1/resolve",
        json={
            "value": "2026-07-15",
            "scope": "field",
            "reason": "Corrigendum supersedes notification.",
            "evidence_url": "not-a-real-url",
        },
    )
    assert r.status_code == 400
    assert "evidence_url" in (r.json().get("detail") or "").lower()


# ─── 6 · reject aggregator conflict ───────────────────────────────────────


def test_reject_aggregator_conflict_marks_rejected_and_audits():
    sb = _seed_two_conflicts()
    client = TestClient(_build_app(sb))
    r = client.post(
        "/api/admin/conflicts/conflict-2/reject",
        json={"reason": "aggregator value rejected by policy"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["conflict"]["status"] == "rejected"
    assert body["conflict"]["resolved_by"] == ADMIN_USER["id"]

    stored = next(
        c for c in sb.db["recruitment_verification_conflicts"] if c["id"] == "conflict-2"
    )
    assert stored["status"] == "rejected"

    audits = sb.db["admin_audit_logs"]
    assert any(a.get("action") == "conflict.reject" for a in audits)


# ─── 7 + 8 · promotion gate integration ───────────────────────────────────


class _PromoteSB:
    """Minimal supabase stub for :func:`promote_to_recruitments`.

    Wraps :class:`SBStub` for the conflict lookup, but stubs the RPC call
    so we can assert the open-conflict guard short-circuits *before* any
    promotion side-effects fire.
    """

    def __init__(self, sb: SBStub):
        self._sb = sb
        self.rpc_calls: list[tuple[str, dict]] = []

    def table(self, name: str):
        return self._sb.table(name)

    def rpc(self, fn: str, params: dict):
        self.rpc_calls.append((fn, params))

        class _Resp:
            data = "recruitment-id-stub"

        class _Call:
            def execute(self_inner):
                return _Resp()

        return _Call()


def _extracted_payload() -> dict[str, Any]:
    """Minimal payload that passes :class:`VerifiedRecruitmentForPromotion`."""
    return {
        "title": "UPSC CSE 2026",
        "organization_name": "Union Public Service Commission",
        "org_type": "central",
        "notification_date": "2026-04-01",
        "apply_start_date": "2026-04-15",
        "apply_end_date": "2026-06-30",
        "total_vacancies": 100,
        "year": 2026,
        "official_notification_url": "https://upsc.gov.in/notice.pdf",
        "official_apply_url": "https://upsc.gov.in/apply",
        "posts": [{"post_name": "Officer"}],
    }


def test_promote_blocks_on_open_conflict_with_field_keys(monkeypatch):
    sb = _seed_two_conflicts()
    promote_sb = _PromoteSB(sb)

    # Suppress side-effects that promote_to_recruitments fires post-write —
    # the guard runs *before* them, so these never get called when the test
    # passes, but stubbing them keeps any regression noise as the actual
    # failure (open-conflict guard miss) rather than collateral errors.
    monkeypatch.setattr(scrape_runner, "_reconcile_lifecycle_events", lambda *a, **k: None)
    monkeypatch.setattr(scrape_runner, "_enqueue_recompute_fanout", lambda *a, **k: 0)

    from app.scraping.schemas import VerifiedRecruitmentForPromotion

    payload = VerifiedRecruitmentForPromotion(**_extracted_payload())
    with pytest.raises(scrape_runner.OpenConflictPromotionError) as exc:
        scrape_runner.promote_to_recruitments(
            payload,
            promote_sb,
            source_id="src-1",
            queue_id="queue-1",
        )
    # Both seeded conflicts hit the guard — apply_end_date AND total_vacancies.
    assert set(exc.value.field_keys) == {"apply_end_date", "total_vacancies"}
    # The guard fires *before* the RPC is invoked.
    assert promote_sb.rpc_calls == []


def test_promote_succeeds_after_all_conflicts_resolved(monkeypatch):
    sb = _seed_two_conflicts()
    # Flip both conflicts to resolved so the guard passes.
    for c in sb.db["recruitment_verification_conflicts"]:
        c["status"] = "resolved_by_admin"

    promote_sb = _PromoteSB(sb)
    monkeypatch.setattr(scrape_runner, "_reconcile_lifecycle_events", lambda *a, **k: None)
    monkeypatch.setattr(scrape_runner, "_enqueue_recompute_fanout", lambda *a, **k: 0)

    from app.scraping.schemas import VerifiedRecruitmentForPromotion

    payload = VerifiedRecruitmentForPromotion(**_extracted_payload())
    rec_id = scrape_runner.promote_to_recruitments(
        payload,
        promote_sb,
        source_id="src-1",
        queue_id="queue-1",
    )
    assert rec_id == "recruitment-id-stub"
    # The RPC was called exactly once now that the guard cleared.
    assert len(promote_sb.rpc_calls) == 1
    assert promote_sb.rpc_calls[0][0] == "promote_recruitment"


# ─── 9 · auth ─────────────────────────────────────────────────────────────


def test_non_admin_caller_gets_403():
    sb = _seed_two_conflicts()
    client = TestClient(_build_app(sb, user=USER_USER))
    r = client.get("/api/admin/scrape/items/queue-1/conflicts")
    assert r.status_code == 403
