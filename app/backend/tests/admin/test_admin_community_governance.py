"""Tests for the admin community governance router.

Covers the four consoles specified in
docs/engineering/community-governance-spec-v1.md §4.1–§4.4:

- Study Groups (archive, freeze/unfreeze, member remove, force-end
  session, invalidate attendance).
- Partner Governance (list, end pair, rematch-block create / delete).
- Mentor Verification (verification upsert, suspend/reinstate,
  payout-hold set/clear).
- Resource Review Queue (decision: approve/reject/edit/hide/dmca; merge).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import admin_community_governance as gov
from app.core.auth import get_current_user
from tests.admin.test_admin_study_os import ExtSBStub  # reuse the extended stub


def _app(sb: ExtSBStub, *, role: str = "super_admin") -> FastAPI:
    app = FastAPI()
    app.include_router(gov.router, prefix="/api")
    gov.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    app.dependency_overrides[get_current_user] = lambda: {
        "id": "admin-1",
        "email": "admin@example.com",
        "role": role,
        "permissions": [],
    }
    return app


def _seed() -> ExtSBStub:
    now = datetime.now(timezone.utc).isoformat()
    sb = ExtSBStub({
        "admin_audit_logs": [],
        "profiles": [
            {"id": "user-a", "email": "a@x", "full_name": "A", "is_instructor": True},
            {"id": "user-b", "email": "b@x", "full_name": "B", "is_instructor": True},
            {"id": "user-c", "email": "c@x", "full_name": "C", "is_instructor": False},
        ],
        "study_groups": [
            {"id": "g1", "name": "Chem Crew", "status": "active", "group_type": "behavior", "visibility": "private", "created_by": "user-a", "frozen_at": None, "created_at": now, "updated_at": now},
            {"id": "g2", "name": "Archived", "status": "archived", "group_type": "behavior", "visibility": "private", "created_by": "user-b", "frozen_at": None, "created_at": now, "updated_at": now},
        ],
        "study_group_members": [
            {"id": "m1", "group_id": "g1", "user_id": "user-a", "role": "owner", "status": "active", "joined_at": now},
            {"id": "m2", "group_id": "g1", "user_id": "user-b", "role": "member", "status": "active", "joined_at": now},
        ],
        "social_study_sessions": [
            {"id": "ses-1", "group_id": "g1", "started_at": now, "ended_at": None, "trust_source": "group_focus_checked", "trust_weight": 0.9, "planned_minutes": 60},
        ],
        "social_session_attendance": [
            {"id": "att-1", "session_id": "ses-1", "user_id": "user-a", "joined_at": now, "left_at": None, "presence_minutes": 30, "focus_check_passed": 3, "focus_check_total": 3, "attendance_status": "present"},
        ],
        "accountability_pairs": [
            {"id": "p1", "user_a": "user-a", "user_b": "user-b", "pairing_goal": "discipline", "status": "active", "created_at": now},
            {"id": "p2", "user_a": "user-c", "user_b": "user-b", "pairing_goal": "mock_review", "status": "ended", "created_at": now},
        ],
        "partner_rematch_blocks": [],
        "mentor_verification": [],
        "mentor_bookings": [
            {"id": "b1", "user_id": "user-c", "mentor_id": "user-a", "slot": now, "status": "awaiting_mentor", "payment_status": "captured", "created_at": now},
        ],
        "moderation_items": [
            {"id": "mod-1", "entity_type": "mentor_profile", "entity_id": "user-a", "severity": "p2", "reason": "abuse", "status": "open", "resolution": None, "created_at": now},
            {"id": "mod-r1", "entity_type": "community_resource", "entity_id": "r-pending", "severity": "p3", "reason": "spam", "status": "open", "resolution": None, "created_at": now},
        ],
        "moderation_events": [],
        "community_resources": [
            {"id": "r-pending", "title": "Pending Doc", "summary": "x", "resource_type": "pdf", "exam_slug": "exam-x", "status": "pending_review", "trust_attribution": "unknown", "created_by": "user-c", "verified_by": None, "verified_by_topper": False, "upvote_count": 0, "report_count": 1, "merged_into": None, "source_url": "https://x/y.pdf", "created_at": now, "updated_at": now},
            {"id": "r-approved", "title": "Approved Doc", "summary": "y", "resource_type": "pdf", "exam_slug": "exam-x", "status": "approved", "trust_attribution": "official", "created_by": "user-a", "verified_by": "admin-1", "verified_by_topper": False, "upvote_count": 10, "report_count": 0, "merged_into": None, "source_url": "https://x/y.pdf", "created_at": now, "updated_at": now},
        ],
        "community_resource_votes": [],
        "community_resource_reports": [],
    })
    return sb


# ─── Study Groups ─────────────────────────────────────────────────────────


def test_groups_list_filters_active():
    sb = _seed()
    app = _app(sb)
    r = TestClient(app).get("/api/admin/community/groups?status=active")
    assert r.status_code == 200
    assert [g["id"] for g in r.json()["items"]] == ["g1"]


def test_groups_detail_returns_members_and_sessions():
    sb = _seed()
    app = _app(sb)
    r = TestClient(app).get("/api/admin/community/groups/g1")
    assert r.status_code == 200
    p = r.json()
    assert p["group"]["id"] == "g1"
    assert len(p["members"]) == 2
    assert len(p["sessions"]) == 1
    assert len(p["attendance"]) == 1


def test_groups_archive_flips_status_and_audits():
    sb = _seed()
    app = _app(sb)
    r = TestClient(app).post("/api/admin/community/groups/g1/archive", json={"reason": "moderation cleanup"})
    assert r.status_code == 200
    assert next(g for g in sb.db["study_groups"] if g["id"] == "g1")["status"] == "archived"
    assert any(a["action"] == "admin.group.archive" for a in sb.db["admin_audit_logs"])


def test_groups_archive_rejects_already_archived():
    sb = _seed()
    app = _app(sb)
    r = TestClient(app).post("/api/admin/community/groups/g2/archive", json={"reason": "double archive"})
    assert r.status_code == 409


def test_groups_freeze_then_unfreeze_cycle():
    sb = _seed()
    app = _app(sb)
    client = TestClient(app)
    r = client.post("/api/admin/community/groups/g1/freeze", json={"reason": "temporary block on group activity"})
    assert r.status_code == 200
    g = next(g for g in sb.db["study_groups"] if g["id"] == "g1")
    assert g["frozen_at"] is not None
    assert g["frozen_reason"] == "temporary block on group activity"
    # Double freeze refused
    r2 = client.post("/api/admin/community/groups/g1/freeze", json={"reason": "another freeze attempt"})
    assert r2.status_code == 409
    # Unfreeze
    r3 = client.post("/api/admin/community/groups/g1/freeze", json={"reason": "clearing the freeze flag", "payload": {"unfreeze": True}})
    assert r3.status_code == 200
    assert next(g for g in sb.db["study_groups"] if g["id"] == "g1")["frozen_at"] is None


def test_groups_remove_member_flips_status_to_removed():
    sb = _seed()
    app = _app(sb)
    r = TestClient(app).delete("/api/admin/community/groups/g1/members/user-b?reason=harassment+report+upheld")
    assert r.status_code == 200
    assert next(m for m in sb.db["study_group_members"] if m["id"] == "m2")["status"] == "removed"
    assert any(a["action"] == "admin.group.member.remove" for a in sb.db["admin_audit_logs"])


def test_groups_force_end_session_sets_ended_at():
    sb = _seed()
    app = _app(sb)
    r = TestClient(app).post("/api/admin/community/groups/g1/sessions/ses-1/force-end", json={"reason": "session stuck after host left"})
    assert r.status_code == 200
    s = next(s for s in sb.db["social_study_sessions"] if s["id"] == "ses-1")
    assert s["ended_at"] is not None


def test_groups_attendance_invalidate_zeroes_trust():
    sb = _seed()
    app = _app(sb)
    r = TestClient(app).post("/api/admin/community/groups/g1/attendance/att-1/invalidate", json={"reason": "forged attendance evidence found"})
    assert r.status_code == 200
    a = next(a for a in sb.db["social_session_attendance"] if a["id"] == "att-1")
    assert a["presence_minutes"] == 0
    assert a["focus_check_passed"] == 0
    assert a["attendance_status"] == "absent"


# ─── Partner governance ──────────────────────────────────────────────────


def test_partners_list_returns_active_only_when_filtered():
    sb = _seed()
    app = _app(sb)
    r = TestClient(app).get("/api/admin/community/partners?status=active")
    assert r.status_code == 200
    assert [p["id"] for p in r.json()["items"]] == ["p1"]


def test_partners_end_pair_audits_and_rejects_already_ended():
    sb = _seed()
    app = _app(sb)
    client = TestClient(app)
    r = client.post("/api/admin/community/partners/p1/end", json={"reason": "abuse report upheld"})
    assert r.status_code == 200
    assert next(p for p in sb.db["accountability_pairs"] if p["id"] == "p1")["status"] == "ended"
    # Already-ended pair is refused.
    r2 = client.post("/api/admin/community/partners/p2/end", json={"reason": "trying to double end"})
    assert r2.status_code == 409


def test_partners_rematch_block_stores_pair_in_lex_order():
    sb = _seed()
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/community/partners/rematch-blocks",
        json={"reason": "repeat ghosting between these users", "payload": {"user_a": "user-b", "user_b": "user-a"}},
    )
    assert r.status_code == 200
    row = sb.db["partner_rematch_blocks"][0]
    assert row["user_a"] == "user-a"
    assert row["user_b"] == "user-b"


def test_partners_rematch_block_refuses_duplicate():
    sb = _seed()
    sb.db["partner_rematch_blocks"] = [{"id": "blk-1", "user_a": "user-a", "user_b": "user-b", "reason": "x" * 10, "created_at": "now"}]
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/community/partners/rematch-blocks",
        json={"reason": "duplicate attempt — should 409", "payload": {"user_a": "user-a", "user_b": "user-b"}},
    )
    assert r.status_code == 409


def test_partners_rematch_block_self_refused():
    sb = _seed()
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/community/partners/rematch-blocks",
        json={"reason": "self block attempt", "payload": {"user_a": "user-a", "user_b": "user-a"}},
    )
    assert r.status_code == 422


def test_partners_rematch_block_delete():
    sb = _seed()
    sb.db["partner_rematch_blocks"] = [{"id": "blk-1", "user_a": "user-a", "user_b": "user-b", "reason": "x" * 10, "created_at": "now"}]
    app = _app(sb)
    r = TestClient(app).delete("/api/admin/community/partners/rematch-blocks/blk-1?reason=block+no+longer+needed")
    assert r.status_code == 200
    assert sb.db["partner_rematch_blocks"] == []


# ─── Mentor verification ─────────────────────────────────────────────────


def test_mentors_list_filters_by_kyc():
    sb = _seed()
    sb.db["mentor_verification"] = [
        {"user_id": "user-a", "status": "approved", "kyc_status": "verified", "payout_hold": False, "updated_at": "now"},
        {"user_id": "user-b", "status": "pending", "kyc_status": "unverified", "payout_hold": False, "updated_at": "now"},
    ]
    app = _app(sb)
    r = TestClient(app).get("/api/admin/mentors?kyc_status=verified")
    assert r.status_code == 200
    assert [m["user_id"] for m in r.json()["items"]] == ["user-a"]


def test_mentors_detail_returns_profile_bookings_complaints():
    sb = _seed()
    app = _app(sb)
    r = TestClient(app).get("/api/admin/mentors/user-a")
    assert r.status_code == 200
    p = r.json()
    assert p["profile"]["id"] == "user-a"
    assert p["verification"] is None  # no row yet
    assert len(p["recent_bookings"]) == 1
    assert any(c["id"] == "mod-1" for c in p["complaints"])


def test_mentors_set_verification_upserts_and_stamps_verifier_on_approval():
    sb = _seed()
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/mentors/user-a/verification",
        json={"reason": "credentials confirmed", "payload": {"status": "approved", "kyc_status": "verified", "kyc_artifact_id": "kyc-123"}},
    )
    assert r.status_code == 200, r.text
    row = sb.db["mentor_verification"][0]
    assert row["status"] == "approved"
    assert row["kyc_status"] == "verified"
    assert row["kyc_artifact_id"] == "kyc-123"
    assert row["verified_by_email"] == "admin@example.com"


def test_mentors_set_verification_rejects_invalid_status():
    sb = _seed()
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/mentors/user-a/verification",
        json={"reason": "trying a bad status", "payload": {"status": "bogus"}},
    )
    assert r.status_code == 422


def test_mentors_suspend_then_reinstate():
    sb = _seed()
    sb.db["mentor_verification"] = [{"user_id": "user-a", "status": "approved", "kyc_status": "verified", "payout_hold": False, "updated_at": "now"}]
    app = _app(sb)
    client = TestClient(app)
    r1 = client.post("/api/admin/mentors/user-a/suspend", json={"reason": "complaint upheld; suspending"})
    assert r1.status_code == 200
    assert sb.db["mentor_verification"][0]["status"] == "suspended"
    # Double suspend is a no-op error.
    r2 = client.post("/api/admin/mentors/user-a/suspend", json={"reason": "trying to double suspend"})
    assert r2.status_code == 409
    r3 = client.post("/api/admin/mentors/user-a/suspend", json={"reason": "complaint dismissed on review", "payload": {"reinstate": True}})
    assert r3.status_code == 200
    assert sb.db["mentor_verification"][0]["status"] == "approved"


def test_mentors_payout_hold_set_and_clear():
    sb = _seed()
    sb.db["mentor_verification"] = [{"user_id": "user-a", "status": "approved", "kyc_status": "verified", "payout_hold": False, "updated_at": "now"}]
    app = _app(sb)
    client = TestClient(app)
    r1 = client.post("/api/admin/mentors/user-a/payout-hold", json={"reason": "payment dispute pending", "payload": {"hold": True}})
    assert r1.status_code == 200
    row = sb.db["mentor_verification"][0]
    assert row["payout_hold"] is True
    assert row["payout_hold_reason"] == "payment dispute pending"
    r2 = client.post("/api/admin/mentors/user-a/payout-hold", json={"reason": "dispute resolved in mentor favour", "payload": {"hold": False}})
    assert r2.status_code == 200
    row = sb.db["mentor_verification"][0]
    assert row["payout_hold"] is False
    assert row["payout_hold_reason"] is None


# ─── Resource review queue ───────────────────────────────────────────────


def test_resources_list_returns_counts():
    sb = _seed()
    app = _app(sb)
    r = TestClient(app).get("/api/admin/community/resources")
    assert r.status_code == 200
    p = r.json()
    assert p["counts"]["pending_review"] == 1
    assert p["counts"]["approved"] == 1
    assert p["counts"]["rejected"] == 0


def test_resources_detail_returns_dedupe_candidates_by_url():
    sb = _seed()
    app = _app(sb)
    r = TestClient(app).get("/api/admin/community/resources/r-pending")
    assert r.status_code == 200
    p = r.json()
    # Both seeded resources share the same source_url; the other one is a dedupe candidate.
    assert any(c["id"] == "r-approved" for c in p["dedupe_candidates"])


def test_resources_decision_approve_emits_moderation_event_when_item_exists():
    sb = _seed()
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/community/resources/r-pending/decision",
        json={"reason": "official source confirmed", "payload": {"action": "approve", "trust_attribution": "official"}},
    )
    assert r.status_code == 200, r.text
    row = next(rr for rr in sb.db["community_resources"] if rr["id"] == "r-pending")
    assert row["status"] == "approved"
    assert row["trust_attribution"] == "official"
    # Moderation event written because mod-r1 exists for this resource.
    assert any(e["item_id"] == "mod-r1" and e["event_type"] == "admin_decision" for e in sb.db["moderation_events"])


def test_resources_decision_reject():
    sb = _seed()
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/community/resources/r-pending/decision",
        json={"reason": "low quality content", "payload": {"action": "reject"}},
    )
    assert r.status_code == 200
    assert next(rr for rr in sb.db["community_resources"] if rr["id"] == "r-pending")["status"] == "rejected"


def test_resources_decision_edit_applies_allowed_fields_only():
    sb = _seed()
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/community/resources/r-pending/decision",
        json={"reason": "fixing title typo", "payload": {"action": "edit", "metadata": {"title": "Fixed Title", "bogus": "ignored"}}},
    )
    assert r.status_code == 200
    row = next(rr for rr in sb.db["community_resources"] if rr["id"] == "r-pending")
    assert row["title"] == "Fixed Title"
    assert "bogus" not in row


def test_resources_decision_edit_requires_some_allowed_field():
    sb = _seed()
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/community/resources/r-pending/decision",
        json={"reason": "edit with no fields", "payload": {"action": "edit", "metadata": {"nothing": "useful"}}},
    )
    assert r.status_code == 422


def test_resources_decision_dmca():
    sb = _seed()
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/community/resources/r-pending/decision",
        json={"reason": "DMCA takedown notice received", "payload": {"action": "dmca"}},
    )
    assert r.status_code == 200
    assert next(rr for rr in sb.db["community_resources"] if rr["id"] == "r-pending")["status"] == "dmca_removed"


def test_resources_decision_invalid_action():
    sb = _seed()
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/community/resources/r-pending/decision",
        json={"reason": "bogus action attempt", "payload": {"action": "burninate"}},
    )
    assert r.status_code == 422


def test_resources_merge_into_sets_merged_into_and_hides():
    sb = _seed()
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/community/resources/r-pending/merge-into",
        json={"reason": "duplicate of approved canonical", "payload": {"canonical_id": "r-approved"}},
    )
    assert r.status_code == 200
    row = next(rr for rr in sb.db["community_resources"] if rr["id"] == "r-pending")
    assert row["merged_into"] == "r-approved"
    assert row["status"] == "hidden"


def test_resources_merge_into_self_refused():
    sb = _seed()
    app = _app(sb)
    r = TestClient(app).post(
        "/api/admin/community/resources/r-pending/merge-into",
        json={"reason": "self merge attempt", "payload": {"canonical_id": "r-pending"}},
    )
    assert r.status_code == 422


def test_governance_writes_reject_short_reason():
    sb = _seed()
    app = _app(sb)
    client = TestClient(app)
    body = {"reason": "x"}
    for path in [
        "/api/admin/community/groups/g1/archive",
        "/api/admin/community/groups/g1/freeze",
        "/api/admin/community/groups/g1/sessions/ses-1/force-end",
        "/api/admin/community/groups/g1/attendance/att-1/invalidate",
        "/api/admin/community/partners/p1/end",
        "/api/admin/community/partners/rematch-blocks",
        "/api/admin/mentors/user-a/verification",
        "/api/admin/mentors/user-a/suspend",
        "/api/admin/mentors/user-a/payout-hold",
        "/api/admin/community/resources/r-pending/decision",
        "/api/admin/community/resources/r-pending/merge-into",
    ]:
        assert client.post(path, json=body).status_code == 422, path


def test_governance_writes_403_when_role_and_perms_missing():
    sb = _seed()
    # Plain user, no admin role, no community.manage permission.
    app = _app(sb, role="user")
    r = TestClient(app).post("/api/admin/community/groups/g1/archive", json={"reason": "non-admin attempt"})
    assert r.status_code == 403
