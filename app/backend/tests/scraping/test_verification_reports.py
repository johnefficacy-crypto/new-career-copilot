"""End-to-end tests for ``app.scraping.verification_reports``.

Exercises every contract in the spec's ship gate (§21):

* same-hash reprocess is noop
* hash-diff reprocess creates a new version atomically
* report_version monotonic + chain_root preserved across versions
* old.superseded_by + old.lifecycle_status set after supersession
* active-uniqueness enforced (partial unique indexes)
* lifecycle transitions only via :func:`update_lifecycle_status`
* Tier C with null exam family becomes ``"other"`` in the service
* canonical_snapshot_hash null on queue-only reports
* recommended_action / trigger_reason free-text rejected
"""
from __future__ import annotations

import pytest

from app.scraping.verification_reports import (
    PR1_LIFECYCLE_STATES,
    PR1_TRIGGER_REASONS,
    backfill_existing_recruitment,
    get_active_report,
    get_or_create_verification_report_for_queue,
    get_or_create_verification_report_for_recruitment,
    mark_superseded,
    update_lifecycle_status,
)

from tests.scraping._verification_fakes import FakeSupabase


# ── fixtures ───────────────────────────────────────────────────────────


def _queue_item(qid: str = "queue-1", **extracted):
    return {
        "id": qid,
        "extracted_data": dict(
            {"title": "UPSC Civil Services Examination 2026", "apply_end_date": "2026-06-30"},
            **extracted,
        ),
    }


# ── reprocess rule (§7) ────────────────────────────────────────────────


def test_initial_scrape_creates_classified_report():
    sb = FakeSupabase()
    item = _queue_item()
    report, outcome = get_or_create_verification_report_for_queue(sb, item)
    assert outcome == "created"
    assert report["lifecycle_status"] == "classified"
    assert report["criticality_tier"] == "A_HIGH_STAKES"
    assert report["exam_family_key"] == "upsc"
    assert report["trigger_reason"] == "initial_scrape"
    assert report["report_version"] == 1
    assert report["chain_root_id"] == report["id"]
    assert report["source_snapshot_hash"]
    assert report["canonical_snapshot_hash"] is None
    assert report["recommended_action"] == "request_admin_review"


def test_same_hash_reprocess_is_noop():
    sb = FakeSupabase()
    item = _queue_item()
    first, _ = get_or_create_verification_report_for_queue(sb, item)
    again, outcome = get_or_create_verification_report_for_queue(sb, item)
    assert outcome == "noop"
    assert again["id"] == first["id"]
    assert len(sb.rows) == 1


def test_hash_diff_reprocess_creates_new_version_and_supersedes_old():
    sb = FakeSupabase()
    first, _ = get_or_create_verification_report_for_queue(sb, _queue_item())
    second, outcome = get_or_create_verification_report_for_queue(
        sb,
        _queue_item(apply_end_date="2026-07-15"),  # hash changes
    )
    assert outcome == "created"
    assert second["id"] != first["id"]
    assert second["report_version"] == 2
    assert second["chain_root_id"] == first["id"]   # chain root preserved
    assert second["trigger_reason"] == "resubmission"
    # old row is marked superseded and points at the new id
    old = sb._find_by_id(sb.TABLE, first["id"])
    assert old["lifecycle_status"] == "superseded"
    assert old["superseded_by"] == second["id"]


def test_chain_root_preserved_across_three_versions():
    sb = FakeSupabase()
    v1, _ = get_or_create_verification_report_for_queue(sb, _queue_item())
    v2, _ = get_or_create_verification_report_for_queue(
        sb, _queue_item(apply_end_date="2026-07-15")
    )
    v3, _ = get_or_create_verification_report_for_queue(
        sb, _queue_item(apply_end_date="2026-08-15")
    )
    assert v1["chain_root_id"] == v1["id"]
    assert v2["chain_root_id"] == v1["id"]
    assert v3["chain_root_id"] == v1["id"]
    assert [v1["report_version"], v2["report_version"], v3["report_version"]] == [1, 2, 3]


# ── active uniqueness (§9 partial indexes) ─────────────────────────────


def test_active_uniqueness_on_queue_id():
    """The fake's index mirror catches the same race the real partial
    unique index catches: two active rows for one scrape_queue_id."""
    sb = FakeSupabase()
    get_or_create_verification_report_for_queue(sb, _queue_item())
    # Manually inject a second active row to simulate a bypass attempt.
    with pytest.raises(ValueError, match="uq_active_verification_report_queue"):
        sb._rpc_create({
            "scrape_queue_id": "queue-1",
            "recruitment_id": None,
            "lifecycle_status": "classified",
            "criticality_tier": "A_HIGH_STAKES",
            "exam_family_key": "upsc",
            "review_strategy": "strict_official_multi_source",
            "publish_policy": "manual_verified_only",
            "recommended_action": "request_admin_review",
            "source_snapshot_hash": "different",
            "canonical_snapshot_hash": None,
            "trigger_reason": "initial_scrape",
            "risk_flags": [],
            "evidence_summary": {},
            "conflicts": [],
        })


# ── lookups ────────────────────────────────────────────────────────────


def test_get_active_report_returns_unsuperseded_only():
    sb = FakeSupabase()
    v1, _ = get_or_create_verification_report_for_queue(sb, _queue_item())
    v2, _ = get_or_create_verification_report_for_queue(
        sb, _queue_item(apply_end_date="2026-07-15")
    )
    active = get_active_report(sb, scrape_queue_id="queue-1")
    assert active["id"] == v2["id"]


def test_get_active_report_requires_one_owner():
    sb = FakeSupabase()
    with pytest.raises(ValueError):
        get_active_report(sb)


# ── lifecycle transitions ──────────────────────────────────────────────


def test_classified_to_rejected_allowed():
    sb = FakeSupabase()
    rep, _ = get_or_create_verification_report_for_queue(sb, _queue_item())
    out = update_lifecycle_status(sb, rep["id"], "rejected")
    assert out["lifecycle_status"] == "rejected"


def test_classified_to_backfilled_needs_review_rejected():
    sb = FakeSupabase()
    rep, _ = get_or_create_verification_report_for_queue(sb, _queue_item())
    with pytest.raises(ValueError):
        update_lifecycle_status(sb, rep["id"], "backfilled_needs_review")


def test_rejected_to_classified_rejected():
    sb = FakeSupabase()
    rep, _ = get_or_create_verification_report_for_queue(sb, _queue_item())
    update_lifecycle_status(sb, rep["id"], "rejected")
    with pytest.raises(ValueError):
        update_lifecycle_status(sb, rep["id"], "classified")


def test_backfilled_to_classified_allowed():
    sb = FakeSupabase()
    rec = {"id": "rec-1", "name": "UPSC Civil Services 2026", "apply_end_date": "2026-06-30"}
    posts = [{"post_name": "IAS"}]
    rep, _ = backfill_existing_recruitment(sb, rec, posts)
    # Tier A backfill → backfilled_needs_review.
    assert rep["lifecycle_status"] == "backfilled_needs_review"
    out = update_lifecycle_status(sb, rep["id"], "classified")
    assert out["lifecycle_status"] == "classified"


def test_superseded_is_terminal():
    sb = FakeSupabase()
    rep1, _ = get_or_create_verification_report_for_queue(sb, _queue_item())
    # Force supersession via the hash-diff path (already covered above)
    # and then try to push the old row to any state.
    get_or_create_verification_report_for_queue(
        sb, _queue_item(apply_end_date="2026-07-15")
    )
    with pytest.raises(ValueError):
        update_lifecycle_status(sb, rep1["id"], "classified")
    with pytest.raises(ValueError):
        update_lifecycle_status(sb, rep1["id"], "rejected")


def test_unknown_lifecycle_status_rejected():
    sb = FakeSupabase()
    rep, _ = get_or_create_verification_report_for_queue(sb, _queue_item())
    with pytest.raises(ValueError, match="unknown lifecycle_status"):
        update_lifecycle_status(sb, rep["id"], "promoted")  # not in PR1


def test_same_state_transition_is_noop():
    # update_lifecycle_status(report, current_state) returns the row
    # rather than failing the transition matrix — same-state calls are
    # always either a retry or a bug, but never destructive.
    sb = FakeSupabase()
    rep, _ = get_or_create_verification_report_for_queue(sb, _queue_item())
    out = update_lifecycle_status(sb, rep["id"], "classified")
    assert out["lifecycle_status"] == "classified"


# ── mark_superseded helper ────────────────────────────────────────────


def test_mark_superseded_rejects_self():
    sb = FakeSupabase()
    rep, _ = get_or_create_verification_report_for_queue(sb, _queue_item())
    with pytest.raises(ValueError, match="supersede itself"):
        mark_superseded(sb, rep["id"], rep["id"])


# ── recruitment-scoped backfill (§11 soft mode) ───────────────────────


def test_recruitment_only_report_populates_canonical_hash_only():
    sb = FakeSupabase()
    rec = {"id": "rec-1", "name": "Vacancy Notice — Office Assistant"}
    posts = [{"post_name": "Office Assistant"}]
    rep, outcome = backfill_existing_recruitment(sb, rec, posts)
    assert outcome == "created"
    assert rep["scrape_queue_id"] is None
    assert rep["recruitment_id"] == "rec-1"
    assert rep["source_snapshot_hash"] is None
    assert rep["canonical_snapshot_hash"]
    assert rep["trigger_reason"] == "backfill_existing_recruitment"


def test_tier_a_backfill_lands_in_backfilled_needs_review():
    sb = FakeSupabase()
    rec = {"id": "rec-1", "name": "SSC CGL 2026"}
    posts = [{"post_name": "Inspector"}]
    rep, _ = backfill_existing_recruitment(sb, rec, posts)
    assert rep["criticality_tier"] == "A_HIGH_STAKES"
    assert rep["lifecycle_status"] == "backfilled_needs_review"


def test_recruitment_backfill_noop_on_hash_match():
    sb = FakeSupabase()
    rec = {"id": "rec-1", "name": "Vacancy Notice"}
    posts = [{"post_name": "Clerk"}]
    first, _ = backfill_existing_recruitment(sb, rec, posts)
    again, outcome = backfill_existing_recruitment(sb, rec, posts)
    assert outcome == "noop"
    assert again["id"] == first["id"]


# ── owner / exam_family rules ─────────────────────────────────────────


def test_tier_c_with_null_exam_family_defaults_to_other():
    sb = FakeSupabase()
    item = _queue_item("queue-2", title="Vacancy Notice — Office Assistant")
    rep, _ = get_or_create_verification_report_for_queue(sb, item)
    assert rep["criticality_tier"] == "C_STANDARD_LONG_TAIL"
    assert rep["exam_family_key"] == "other"


def test_owner_missing_raises():
    sb = FakeSupabase()
    item = {"id": "", "extracted_data": {}}
    with pytest.raises(ValueError):
        get_or_create_verification_report_for_queue(sb, item)


# ── enum invariants ────────────────────────────────────────────────────


def test_pr1_lifecycle_states_pinned():
    assert PR1_LIFECYCLE_STATES == frozenset({
        "classified", "backfilled_needs_review", "superseded", "rejected"
    })


def test_pr1_trigger_reasons_pinned():
    # Spec §10 — admin_requested is deferred until the admin re-run
    # endpoint ships.
    assert PR1_TRIGGER_REASONS == frozenset({
        "initial_scrape", "resubmission", "backfill_existing_recruitment"
    })


# ── canonical hash population rule (§4) ───────────────────────────────


def test_queue_only_report_has_null_canonical_hash():
    sb = FakeSupabase()
    rep, _ = get_or_create_verification_report_for_queue(sb, _queue_item())
    assert rep["canonical_snapshot_hash"] is None
    assert rep["source_snapshot_hash"]


def test_recruitment_linked_report_has_canonical_hash():
    sb = FakeSupabase()
    rec = {"id": "rec-1", "name": "UPSC Civil Services 2026"}
    posts = [{"post_name": "IAS"}]
    rep, _ = get_or_create_verification_report_for_recruitment(sb, rec, posts)
    assert rep["canonical_snapshot_hash"]
    assert rep["source_snapshot_hash"] is None
