"""Tests for ``app.scraping.consensus_engine``.

Plan §4 acceptance:

* official source wins over aggregator (no conflict recorded when only
  aggregator disagrees with a single official)
* two officials disagreeing → conflict
* aggregator-only value cannot become canonical
* conflict_id is stable across writes (caller-supplied or uuid4)
"""
from __future__ import annotations

from app.scraping.consensus_engine import (
    SourceObservation,
    collect_observations,
    compare_observations,
    has_unresolved_conflict,
)


def _obs(source: str, trust: str, field_path: str, value):
    return SourceObservation(
        source=source, host=None, trust=trust,
        field_path=field_path, value=value,
    )


# ── single-value unanimity ────────────────────────────────────────────


def test_no_conflict_when_all_sources_agree():
    result = compare_observations([
        _obs("q1", "official", "apply_end_date", "2026-06-30"),
        _obs("q2", "official", "apply_end_date", "2026-06-30"),
    ])
    assert result.conflicts == []
    assert result.canonical_values["apply_end_date"] == "2026-06-30"
    assert result.has_unresolved is False


# ── official wins over aggregator ─────────────────────────────────────


def test_single_official_overrides_aggregator_silently():
    result = compare_observations([
        _obs("q-official", "official", "apply_end_date", "2026-06-30"),
        _obs("q-aggregator", "aggregator", "apply_end_date", "2026-07-15"),
    ])
    assert result.conflicts == []
    assert result.canonical_values["apply_end_date"] == "2026-06-30"


def test_aggregator_only_disagreement_is_not_canonical():
    result = compare_observations([
        _obs("q-agg-1", "aggregator", "apply_end_date", "2026-06-30"),
        _obs("q-agg-2", "aggregator", "apply_end_date", "2026-07-15"),
    ])
    # No official anchor; canonical not set; not flagged as conflict.
    assert result.conflicts == []
    assert "apply_end_date" not in result.canonical_values


# ── two officials disagreeing → conflict ──────────────────────────────


def test_two_officials_disagreeing_creates_conflict():
    result = compare_observations([
        _obs("q-off-1", "official", "apply_end_date", "2026-06-30"),
        _obs("q-off-2", "official", "apply_end_date", "2026-07-15"),
    ])
    assert len(result.conflicts) == 1
    c = result.conflicts[0]
    assert c.field_path == "apply_end_date"
    assert c.conflict_key == "apply_end_date.official_disagreement"
    assert c.conflict_id  # uuid4 string
    assert {v["value"] for v in c.values} == {"2026-06-30", "2026-07-15"}
    assert result.has_unresolved is True


def test_conflict_id_is_unique_per_field():
    result = compare_observations([
        _obs("q-off-1", "official", "apply_end_date", "2026-06-30"),
        _obs("q-off-2", "official", "apply_end_date", "2026-07-15"),
        _obs("q-off-3", "official", "total_vacancies", 100),
        _obs("q-off-4", "official", "total_vacancies", 150),
    ])
    assert len(result.conflicts) == 2
    ids = {c.conflict_id for c in result.conflicts}
    assert len(ids) == 2


# ── observation collection ────────────────────────────────────────────


def test_collect_observations_extracts_consensus_fields_from_primary():
    primary = {
        "id": "q1",
        "source_url": "https://upsc.gov.in/notif",
        "extracted_data": {
            "title": "UPSC CSE",
            "apply_end_date": "2026-06-30",
            "total_vacancies": 100,
            "posts": [{"post_name": "IAS"}, {"post_name": "IPS"}],
        },
    }
    out = collect_observations(primary_queue_item=primary, primary_source=None)
    field_paths = {o.field_path for o in out}
    assert "title" in field_paths
    assert "apply_end_date" in field_paths
    assert "total_vacancies" in field_paths
    assert "post_names" in field_paths


def test_collect_observations_classifies_govt_host_as_official():
    primary = {
        "id": "q1",
        "source_url": "https://upsc.gov.in/notif",
        "extracted_data": {"title": "UPSC CSE"},
    }
    out = collect_observations(primary_queue_item=primary, primary_source=None)
    assert all(o.trust == "official" for o in out)


def test_collect_observations_classifies_unknown_host_as_unknown():
    primary = {
        "id": "q1",
        "source_url": "https://gen-news.org/notif",
        "extracted_data": {"title": "UPSC CSE"},
    }
    out = collect_observations(primary_queue_item=primary, primary_source=None)
    assert all(o.trust == "unknown" for o in out)


def test_source_registry_trust_overrides_host_heuristic():
    # Even an unknown host gets official trust when source_registry says so.
    primary = {
        "id": "q1",
        "source_url": "https://gen-news.org/notif",
        "extracted_data": {"title": "UPSC CSE"},
    }
    out = collect_observations(
        primary_queue_item=primary,
        primary_source={"trust_tier": "official"},
    )
    assert all(o.trust == "official" for o in out)


# ── peer inclusion ────────────────────────────────────────────────────


def test_peers_contribute_observations():
    primary = {
        "id": "q1",
        "source_url": "https://upsc.gov.in/notif",
        "extracted_data": {"apply_end_date": "2026-06-30"},
    }
    peer = {
        "id": "q2",
        "source_url": "https://ssc.nic.in/notif",
        "extracted_data": {"apply_end_date": "2026-07-15"},
    }
    obs = collect_observations(
        primary_queue_item=primary,
        primary_source=None,
        peer_queue_items=[peer],
    )
    result = compare_observations(obs)
    # Two distinct official values for the same field → conflict.
    assert len(result.conflicts) == 1


# ── has_unresolved_conflict ──────────────────────────────────────────


def test_has_unresolved_conflict_true_when_any_open():
    report = {
        "conflicts": [
            {"conflict_id": "a", "status": "resolved_by_admin"},
            {"conflict_id": "b", "status": "open"},
        ]
    }
    assert has_unresolved_conflict(report) is True


def test_has_unresolved_conflict_false_when_all_resolved():
    report = {
        "conflicts": [
            {"conflict_id": "a", "status": "resolved_by_admin"},
            {"conflict_id": "b", "status": "ignored"},
        ]
    }
    assert has_unresolved_conflict(report) is False


def test_has_unresolved_conflict_default_status_is_open():
    report = {"conflicts": [{"conflict_id": "a"}]}
    assert has_unresolved_conflict(report) is True


def test_has_unresolved_conflict_handles_missing_or_empty():
    assert has_unresolved_conflict({}) is False
    assert has_unresolved_conflict({"conflicts": []}) is False
    assert has_unresolved_conflict({"conflicts": None}) is False
