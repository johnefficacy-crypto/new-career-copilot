"""PR5 staleness watcher + batch acknowledgment tests.

Plan §6 ship gate:

* stale Tier A appears in admin needs-attention queue
* mass corrigendum produces one batch row, not 300 cards
* pending_reverification_batch flips to needs_reverification only
  after admin acknowledges
* await_corrigendum recommended_action enum lands
"""
from __future__ import annotations

from app.scraping.source_watch import (
    FreshScrape,
    acknowledge_batch,
    compute_valid_until,
    run_source_watch_pass,
)
from app.scraping.verification_hash import build_source_snapshot_hash

from tests.scraping._verification_fakes import FakeSupabase


def _seed_report(sb: FakeSupabase, rid: str, source_hash: str, *, tier: str = "A_HIGH_STAKES") -> dict:
    row = {
        "id": rid,
        "scrape_queue_id": f"queue-{rid}",
        "recruitment_id": None,
        "lifecycle_status": "classified",
        "criticality_tier": tier,
        "exam_family_key": "upsc",
        "review_strategy": "strict_official_multi_source",
        "publish_policy": "manual_verified_only",
        "recommended_action": "request_admin_review",
        "trigger_reason": "initial_scrape",
        "report_version": 1,
        "chain_root_id": rid,
        "risk_flags": [],
        "evidence_summary": {},
        "conflicts": [],
        "source_snapshot_hash": source_hash,
        "canonical_snapshot_hash": None,
        "staleness_status": "fresh",
    }
    sb.rows.append(row)
    return row


# ── valid_until populator ────────────────────────────────────────────


def test_compute_valid_until_prefers_apply_end_date():
    out = compute_valid_until({"apply_end_date": "2026-06-30"})
    assert out == "2026-06-30"


def test_compute_valid_until_falls_back_to_exam_start_date():
    out = compute_valid_until({"exam_start_date": "2026-07-15"})
    assert out == "2026-07-15"


def test_compute_valid_until_none_when_neither_present():
    assert compute_valid_until({}) is None
    assert compute_valid_until({"notes": "..."}) is None


# ── source watch — drift detection ────────────────────────────────────


def test_drifted_report_marked_stale_source_changed():
    sb = FakeSupabase()
    old_extracted = {"title": "UPSC CSE 2026", "apply_end_date": "2026-06-30"}
    old_hash = build_source_snapshot_hash(old_extracted)
    _seed_report(sb, "rep-1", old_hash)

    stats = run_source_watch_pass(sb, [
        FreshScrape(
            report_id="rep-1",
            source_id="src-1",
            extracted_data={"title": "UPSC CSE 2026", "apply_end_date": "2026-07-15"},
        ),
    ])
    assert stats.source_drift_marked == 1
    assert stats.pending_batch == 0
    rep = sb._find_by_id(sb.TABLE, "rep-1")
    assert rep["staleness_status"] == "stale_source_changed"
    assert rep["lifecycle_status"] == "stale_source_changed"


def test_unchanged_hash_does_not_mark_stale():
    sb = FakeSupabase()
    extracted = {"title": "UPSC CSE 2026", "apply_end_date": "2026-06-30"}
    old_hash = build_source_snapshot_hash(extracted)
    _seed_report(sb, "rep-1", old_hash)
    stats = run_source_watch_pass(sb, [
        FreshScrape(report_id="rep-1", source_id="src-1", extracted_data=extracted),
    ])
    assert stats.source_drift_marked == 0
    rep = sb._find_by_id(sb.TABLE, "rep-1")
    assert rep["staleness_status"] == "fresh"
    assert rep["lifecycle_status"] == "classified"


def test_suppressed_trigger_returns_empty_pass():
    sb = FakeSupabase()
    extracted = {"title": "UPSC", "apply_end_date": "2026-06-30"}
    _seed_report(sb, "rep-1", build_source_snapshot_hash(extracted))
    stats = run_source_watch_pass(
        sb,
        [FreshScrape(report_id="rep-1", source_id="src-1", extracted_data=extracted)],
        trigger="admin_override_added",
    )
    assert stats.source_drift_marked == 0
    assert stats.suppressed == 1


# ── mass corrigendum batching ────────────────────────────────────────


def test_mass_corrigendum_promotes_first_25_and_defers_rest():
    sb = FakeSupabase()
    old = {"title": "UPSC", "apply_end_date": "2026-06-30"}
    old_hash = build_source_snapshot_hash(old)
    fresh: list[FreshScrape] = []
    for i in range(40):   # 40 > batch_limit (25)
        rid = f"rep-{i:02d}"
        _seed_report(sb, rid, old_hash)
        fresh.append(FreshScrape(
            report_id=rid,
            source_id="src-1",
            extracted_data={"title": "UPSC", "apply_end_date": "2026-07-15"},
        ))
    stats = run_source_watch_pass(sb, fresh)
    assert stats.source_drift_marked == 25
    assert stats.pending_batch == 15
    # Exactly one batch row created.
    batches = sb.get_table("reverification_batches")
    assert len(batches) == 1
    batch = batches[0]
    assert batch["total_reports_affected"] == 40
    assert batch["promoted_to_needs_reverification"] == 25
    assert batch["remaining_pending"] == 15


def test_pending_batch_reports_do_not_flip_lifecycle():
    # plan §6 explicitly: pending_reverification_batch is a
    # staleness_status value, NOT a lifecycle state.
    sb = FakeSupabase()
    old_hash = build_source_snapshot_hash({"title": "X"})
    fresh: list[FreshScrape] = []
    for i in range(30):
        rid = f"rep-{i:02d}"
        _seed_report(sb, rid, old_hash)
        fresh.append(FreshScrape(
            report_id=rid,
            source_id="src-1",
            extracted_data={"title": "X", "apply_end_date": "2026-07-15"},
        ))
    run_source_watch_pass(sb, fresh)
    deferred = [r for r in sb.rows if r["staleness_status"] == "pending_reverification_batch"]
    assert deferred
    # Lifecycle stays at whatever it was before the watch pass.
    for r in deferred:
        assert r["lifecycle_status"] == "classified"


# ── acknowledge batch ────────────────────────────────────────────────


def test_acknowledge_batch_promotes_pending_reports_in_chunks():
    sb = FakeSupabase()
    old_hash = build_source_snapshot_hash({"title": "X"})
    fresh: list[FreshScrape] = []
    for i in range(30):
        rid = f"rep-{i:02d}"
        _seed_report(sb, rid, old_hash)
        fresh.append(FreshScrape(
            report_id=rid,
            source_id="src-1",
            extracted_data={"title": "X", "apply_end_date": "2026-07-15"},
        ))
    run_source_watch_pass(sb, fresh)
    batch = sb.get_table("reverification_batches")[0]

    promoted = acknowledge_batch(sb, batch["id"], acknowledged_by="admin-1", chunk_size=10)
    assert promoted == 5   # only 5 reports were pending
    # All pending should now be needs_reverification.
    pending_after = [r for r in sb.rows if r["staleness_status"] == "pending_reverification_batch"]
    assert pending_after == []


def test_acknowledge_unknown_batch_raises():
    sb = FakeSupabase()
    import pytest
    with pytest.raises(LookupError):
        acknowledge_batch(sb, "nope", acknowledged_by="admin-1")
