"""Tests for the PR5 canonical-edit hook.

Plan §6 ship gate:

* canonical edit hook only fires on CRITICAL_FIELDS changes
* hook fires only when canonical hash actually drifts
"""
from __future__ import annotations

from app.scraping.source_watch import on_recruitment_critical_field_edit
from app.scraping.verification_hash import build_canonical_snapshot_hash

from tests.scraping._verification_fakes import FakeSupabase


def _seed(sb: FakeSupabase, *, apply_end_date: str = "2026-06-30") -> None:
    rec = {
        "id": "rec-1",
        "name": "UPSC Civil Services 2026",
        "apply_end_date": apply_end_date,
    }
    posts = [{"recruitment_id": "rec-1", "post_name": "IAS"}]
    sb.get_table("recruitments").append(rec)
    sb.get_table("posts").extend(posts)
    rep = {
        "id": "rep-1",
        "scrape_queue_id": None,
        "recruitment_id": "rec-1",
        "lifecycle_status": "classified",
        "criticality_tier": "A_HIGH_STAKES",
        "exam_family_key": "upsc",
        "review_strategy": "strict_official_multi_source",
        "publish_policy": "manual_verified_only",
        "recommended_action": "request_admin_review",
        "trigger_reason": "backfill_existing_recruitment",
        "report_version": 1,
        "chain_root_id": "rep-1",
        "risk_flags": [],
        "evidence_summary": {},
        "conflicts": [],
        "source_snapshot_hash": None,
        "canonical_snapshot_hash": build_canonical_snapshot_hash(rec, posts),
        "staleness_status": "fresh",
    }
    sb.rows.append(rep)


def test_hook_does_not_fire_on_non_critical_field_edit():
    sb = FakeSupabase()
    _seed(sb)
    result = on_recruitment_critical_field_edit(
        sb, "rec-1", changed_fields={"internal_notes"},
    )
    assert result is None
    rep = sb._find_by_id(sb.TABLE, "rep-1")
    assert rep["staleness_status"] == "fresh"


def test_hook_does_not_fire_when_hash_unchanged():
    # Critical field nominally edited, but the value didn't actually
    # change (admin opened the form and saved without changes).
    sb = FakeSupabase()
    _seed(sb, apply_end_date="2026-06-30")
    result = on_recruitment_critical_field_edit(
        sb, "rec-1", changed_fields={"apply_end_date"},
    )
    assert result is None
    rep = sb._find_by_id(sb.TABLE, "rep-1")
    assert rep["staleness_status"] == "fresh"


def test_hook_fires_when_apply_end_date_drifts():
    sb = FakeSupabase()
    _seed(sb, apply_end_date="2026-06-30")
    # Admin updates the canonical row.
    sb.get_table("recruitments")[0]["apply_end_date"] = "2026-07-15"
    result = on_recruitment_critical_field_edit(
        sb, "rec-1", changed_fields={"apply_end_date"},
    )
    assert result is not None
    rep = sb._find_by_id(sb.TABLE, "rep-1")
    assert rep["staleness_status"] == "stale_canonical_changed"
    assert rep["lifecycle_status"] == "stale_canonical_changed"


def test_hook_returns_none_when_no_active_report():
    sb = FakeSupabase()
    sb.get_table("recruitments").append({"id": "rec-1", "name": "X"})
    sb.get_table("posts").append({"recruitment_id": "rec-1", "post_name": "Y"})
    # No verification_report seeded.
    result = on_recruitment_critical_field_edit(
        sb, "rec-1", changed_fields={"apply_end_date"},
    )
    assert result is None


def test_hook_returns_none_when_recruitment_missing():
    sb = FakeSupabase()
    result = on_recruitment_critical_field_edit(
        sb, "nope", changed_fields={"apply_end_date"},
    )
    assert result is None
