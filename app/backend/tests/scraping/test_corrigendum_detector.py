"""Tests for ``app.scraping.corrigendum_detector``.

Plan §6 acceptance:

* same normalised hash is noop (no drift)
* raw HTML/CSS noise does not trigger version churn
* canonical edit hook only on critical fields
* admin override and resolver re-runs do not trigger staleness
"""
from __future__ import annotations

from app.scraping.corrigendum_detector import (
    detect_canonical_drift,
    detect_source_drift,
    staleness_suppressed,
)
from app.scraping.verification_hash import (
    build_canonical_snapshot_hash,
    build_source_snapshot_hash,
)


def _report(*, source_hash: str | None = None, canonical_hash: str | None = None) -> dict:
    return {
        "id": "rep-1",
        "source_snapshot_hash": source_hash,
        "canonical_snapshot_hash": canonical_hash,
    }


# ── source drift ─────────────────────────────────────────────────────


def test_source_drift_false_when_hash_unchanged():
    extracted = {"title": "UPSC CSE 2026", "apply_end_date": "2026-06-30"}
    old_hash = build_source_snapshot_hash(extracted)
    decision = detect_source_drift(
        active_report=_report(source_hash=old_hash),
        new_extracted_data=extracted,
    )
    assert decision.drifted is False
    assert decision.reason == "hash_match"


def test_source_drift_true_when_apply_end_date_changes():
    old = {"title": "UPSC CSE 2026", "apply_end_date": "2026-06-30"}
    new = {"title": "UPSC CSE 2026", "apply_end_date": "2026-07-15"}
    decision = detect_source_drift(
        active_report=_report(source_hash=build_source_snapshot_hash(old)),
        new_extracted_data=new,
    )
    assert decision.drifted is True
    assert decision.trigger_reason == "source_hash_changed"


def test_source_drift_ignores_raw_html_noise():
    base = {"title": "UPSC CSE 2026", "apply_end_date": "2026-06-30"}
    # Different raw HTML / ads / CDN wrapper, same substantive data.
    new = dict(base, raw_html="<html>NEW</html>", ads=[{"x": 1}], cdn_wrapper="v2")
    decision = detect_source_drift(
        active_report=_report(source_hash=build_source_snapshot_hash(base)),
        new_extracted_data=new,
    )
    assert decision.drifted is False


def test_source_drift_no_active_report():
    decision = detect_source_drift(
        active_report=None,
        new_extracted_data={"title": "X"},
    )
    assert decision.drifted is False
    assert decision.reason == "no_active_report"


def test_source_drift_no_baseline_hash():
    # Active report exists but never had a source hash (recruitment-only
    # report from PR7 backfill).
    decision = detect_source_drift(
        active_report=_report(source_hash=None),
        new_extracted_data={"title": "X"},
    )
    assert decision.drifted is False
    assert decision.reason == "no_baseline_hash"


# ── canonical drift ──────────────────────────────────────────────────


def test_canonical_drift_false_when_hash_unchanged():
    rec = {"name": "UPSC CSE 2026", "apply_end_date": "2026-06-30"}
    posts = [{"post_name": "IAS"}]
    old = build_canonical_snapshot_hash(rec, posts)
    decision = detect_canonical_drift(
        active_report=_report(canonical_hash=old),
        recruitment=rec, posts=posts,
    )
    assert decision.drifted is False


def test_canonical_drift_true_when_apply_end_date_edited():
    rec_before = {"name": "UPSC CSE 2026", "apply_end_date": "2026-06-30"}
    rec_after = {"name": "UPSC CSE 2026", "apply_end_date": "2026-07-15"}
    posts = [{"post_name": "IAS"}]
    old_hash = build_canonical_snapshot_hash(rec_before, posts)
    decision = detect_canonical_drift(
        active_report=_report(canonical_hash=old_hash),
        recruitment=rec_after, posts=posts,
    )
    assert decision.drifted is True
    assert decision.trigger_reason == "canonical_field_edited"


def test_canonical_drift_true_when_post_added():
    rec = {"name": "UPSC CSE 2026"}
    old_hash = build_canonical_snapshot_hash(rec, [{"post_name": "IAS"}])
    new_posts = [{"post_name": "IAS"}, {"post_name": "IPS"}]
    decision = detect_canonical_drift(
        active_report=_report(canonical_hash=old_hash),
        recruitment=rec, posts=new_posts,
    )
    assert decision.drifted is True


# ── suppressed staleness triggers ────────────────────────────────────


def test_admin_override_trigger_is_suppressed():
    assert staleness_suppressed("admin_override_added") is True


def test_resolver_state_change_after_admin_attach_is_suppressed():
    assert staleness_suppressed("resolver_state_changed_after_admin_attach") is True


def test_lifecycle_recommended_action_changes_are_suppressed():
    assert staleness_suppressed("lifecycle_status_changed") is True
    assert staleness_suppressed("recommended_action_recomputed") is True


def test_genuine_source_hash_change_is_not_suppressed():
    assert staleness_suppressed("source_hash_changed") is False


def test_canonical_field_edit_is_not_suppressed():
    assert staleness_suppressed("canonical_field_edited") is False
