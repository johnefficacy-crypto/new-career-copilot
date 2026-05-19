"""Tests for the PR7 soft-backfill driver.

Plan §2 + §9 (PR7 ship gate):

* emits only PR1 enum values
* canonical hash required, source hash null
* re-run noop on same canonical hash
* one active report per recruitment
* no auto-unpublish
* Tier A missing-proof lands in needs-attention queue
"""
from __future__ import annotations

import pytest

from app.scraping.verification_backfill import (
    BackfillStats,
    backfill_recruitment,
    iter_published_recruitments,
    run_backfill,
)

from tests.scraping._verification_fakes import FakeSupabase


def _seed_recruitment(sb: FakeSupabase, rec: dict, posts: list[dict] | None = None) -> None:
    sb.get_table("recruitments").append(dict(rec))
    if posts:
        for p in posts:
            sb.get_table("posts").append({"recruitment_id": rec["id"], **p})


# ── enum compatibility (PR7 ship gate) ─────────────────────────────────


def test_backfill_emits_only_pr1_trigger_reason():
    sb = FakeSupabase()
    _seed_recruitment(
        sb,
        {"id": "rec-1", "name": "Vacancy Notice — Clerk", "publish_status": "published"},
        [{"post_name": "Clerk"}],
    )
    report, outcome = backfill_recruitment(sb, sb.get_table("recruitments")[0])
    assert outcome == "created"
    assert report["trigger_reason"] == "backfill_existing_recruitment"


def test_backfill_emits_only_pr1_lifecycle_states():
    sb = FakeSupabase()
    _seed_recruitment(sb, {"id": "rec-1", "name": "Vacancy Notice", "publish_status": "published"})
    report, _ = backfill_recruitment(sb, sb.get_table("recruitments")[0])
    assert report["lifecycle_status"] in {"classified", "backfilled_needs_review"}


def test_backfill_emits_only_pr1_recommended_actions():
    sb = FakeSupabase()
    _seed_recruitment(sb, {"id": "rec-1", "name": "Vacancy Notice", "publish_status": "published"})
    report, _ = backfill_recruitment(sb, sb.get_table("recruitments")[0])
    assert report["recommended_action"] in {
        "request_admin_review", "promote_eligible", "no_action",
    }


# ── canonical hash population (§4 of v1 + §2 of plan) ─────────────────


def test_backfill_sets_canonical_hash_and_leaves_source_hash_null():
    sb = FakeSupabase()
    _seed_recruitment(sb, {"id": "rec-1", "name": "Vacancy Notice", "publish_status": "published"})
    report, _ = backfill_recruitment(sb, sb.get_table("recruitments")[0])
    assert report["canonical_snapshot_hash"]
    assert report["source_snapshot_hash"] is None
    assert report["scrape_queue_id"] is None
    assert report["recruitment_id"] == "rec-1"


# ── re-run rule ────────────────────────────────────────────────────────


def test_rerun_with_same_canonical_hash_is_noop():
    sb = FakeSupabase()
    _seed_recruitment(
        sb,
        {"id": "rec-1", "name": "Vacancy Notice", "publish_status": "published"},
        [{"post_name": "Clerk"}],
    )
    first, outcome_first = backfill_recruitment(sb, sb.get_table("recruitments")[0])
    second, outcome_second = backfill_recruitment(sb, sb.get_table("recruitments")[0])
    assert outcome_first == "created"
    assert outcome_second == "noop"
    assert first["id"] == second["id"]
    # One active report per recruitment.
    active = [r for r in sb.rows if not r.get("superseded_by")]
    assert len(active) == 1


def test_rerun_with_canonical_drift_creates_new_version():
    sb = FakeSupabase()
    _seed_recruitment(
        sb,
        {"id": "rec-1", "name": "Vacancy Notice", "publish_status": "published"},
        [{"post_name": "Clerk"}],
    )
    first, _ = backfill_recruitment(sb, sb.get_table("recruitments")[0])
    # Add a post — canonical hash drifts.
    sb.get_table("posts").append({"recruitment_id": "rec-1", "post_name": "Assistant"})
    second, outcome = backfill_recruitment(sb, sb.get_table("recruitments")[0])
    assert outcome == "created"
    assert second["report_version"] == 2
    assert second["chain_root_id"] == first["id"]


# ── Tier A needs-review behavior ───────────────────────────────────────


def test_tier_a_recruitment_lands_in_backfilled_needs_review():
    sb = FakeSupabase()
    _seed_recruitment(
        sb,
        {"id": "rec-1", "name": "UPSC Civil Services 2026", "publish_status": "published"},
        [{"post_name": "IAS"}],
    )
    report, _ = backfill_recruitment(sb, sb.get_table("recruitments")[0])
    assert report["criticality_tier"] == "A_HIGH_STAKES"
    assert report["lifecycle_status"] == "backfilled_needs_review"
    assert report["recommended_action"] == "request_admin_review"


def test_tier_c_recruitment_lands_in_classified():
    sb = FakeSupabase()
    _seed_recruitment(
        sb,
        {"id": "rec-1", "name": "Vacancy Notice — Clerk", "publish_status": "published"},
    )
    report, _ = backfill_recruitment(sb, sb.get_table("recruitments")[0])
    assert report["criticality_tier"] == "C_STANDARD_LONG_TAIL"
    assert report["lifecycle_status"] == "classified"


# ── no auto-unpublish (§2) ─────────────────────────────────────────────


def test_backfill_does_not_modify_recruitments_table():
    sb = FakeSupabase()
    _seed_recruitment(
        sb,
        {"id": "rec-1", "name": "UPSC 2026", "publish_status": "published"},
    )
    before = dict(sb.get_table("recruitments")[0])
    backfill_recruitment(sb, sb.get_table("recruitments")[0])
    after = sb.get_table("recruitments")[0]
    assert after == before
    assert after["publish_status"] == "published"


# ── missing id is silently skipped ────────────────────────────────────


def test_backfill_skips_recruitment_with_no_id():
    sb = FakeSupabase()
    report, outcome = backfill_recruitment(sb, {"name": "missing-id"})
    assert report is None
    assert outcome == "skipped"


# ── iterator + driver ──────────────────────────────────────────────────


def test_iter_published_recruitments_yields_only_published():
    sb = FakeSupabase()
    sb.get_table("recruitments").extend([
        {"id": "rec-1", "name": "A", "publish_status": "published"},
        {"id": "rec-2", "name": "B", "publish_status": "draft"},
        {"id": "rec-3", "name": "C", "publish_status": "published"},
    ])
    out = list(iter_published_recruitments(sb, page_size=10))
    ids = {r["id"] for r in out}
    assert ids == {"rec-1", "rec-3"}


def test_iter_pagination_progresses_via_id_cursor():
    sb = FakeSupabase()
    for i in range(7):
        sb.get_table("recruitments").append({
            "id": f"rec-{i:02d}",
            "name": f"R{i}",
            "publish_status": "published",
        })
    out = list(iter_published_recruitments(sb, page_size=2))
    assert [r["id"] for r in out] == [f"rec-{i:02d}" for i in range(7)]


def test_run_backfill_aggregates_stats():
    sb = FakeSupabase()
    sb.get_table("recruitments").extend([
        {"id": "rec-1", "name": "UPSC 2026", "publish_status": "published"},
        {"id": "rec-2", "name": "Vacancy Notice", "publish_status": "published"},
    ])
    stats = run_backfill(sb)
    assert stats.total_seen == 2
    assert stats.created == 2
    assert stats.noop == 0
    assert stats.tier_a_needs_review == 1   # UPSC
    assert stats.errors == 0


def test_run_backfill_second_pass_is_all_noop():
    sb = FakeSupabase()
    sb.get_table("recruitments").extend([
        {"id": "rec-1", "name": "UPSC 2026", "publish_status": "published"},
        {"id": "rec-2", "name": "Vacancy Notice", "publish_status": "published"},
    ])
    run_backfill(sb)
    second = run_backfill(sb)
    assert second.created == 0
    assert second.noop == 2


def test_run_backfill_respects_max_recruitments():
    sb = FakeSupabase()
    for i in range(5):
        sb.get_table("recruitments").append({
            "id": f"rec-{i:02d}",
            "name": "Vacancy Notice",
            "publish_status": "published",
        })
    stats = run_backfill(sb, max_recruitments=2)
    assert stats.total_seen == 2
    assert stats.created == 2


# ── stats merging ─────────────────────────────────────────────────────


def test_backfill_stats_merge():
    a = BackfillStats(total_seen=2, created=1, noop=1, tier_a_needs_review=1)
    b = BackfillStats(total_seen=3, created=2, errors=1, error_ids=["x"])
    a.merge(b)
    assert a.total_seen == 5
    assert a.created == 3
    assert a.errors == 1
    assert a.error_ids == ["x"]
