"""Tests for the scraper round-trip optimizations (Tasks 1, 4, 5, 6).

Tasks 2/3 (per-candidate targeted dedup queries) are intentionally NOT in
this PR — see the PR body. They require a filter-aware test harness and a
sign-off on the narrower pre-check dedup semantics.
"""
from __future__ import annotations

import pytest

from app.scraping import runner as runner_mod
from app.scraping import source_drafts as drafts_mod
from app.scraping.extractor import canonical_key_invalid
from tests.test_scrape_runner_promote import RunnerSB


# ════════════════════════════════════════════════════════════════════════
#  Task 6 — canonical_key validator rejects trailing/empty segments
# ════════════════════════════════════════════════════════════════════════


@pytest.mark.parametrize(
    "key,expected_invalid",
    [
        ("foo-2024-physics", False),       # 3 non-empty segments → valid
        ("foo-2024-1", False),             # valid
        ("maharashtra-2024-", True),       # trailing dash (empty title) — the bug
        ("foo-2024-", True),               # trailing dash
        ("-2024-physics", True),           # leading dash (empty org)
        ("foo--2024-x", True),             # double dash / wrong segment count
        ("foo-2024", True),                # only 2 segments
        ("-0-", True),                     # the old all-empty collapse case
        ("", True),                        # empty
        (None, True),                      # non-string
    ],
)
def test_canonical_key_invalid(key, expected_invalid):
    assert canonical_key_invalid(key) is expected_invalid


# ════════════════════════════════════════════════════════════════════════
#  Task 1 — one merged source_registry PATCH on the success path
# ════════════════════════════════════════════════════════════════════════


def test_success_path_folds_claim_release_into_mark_success():
    """A normal pass must clear ``currently_scraping_at`` inside the same
    PATCH that records success — not as a separate second PATCH ~100ms
    later. So every release-style update (currently_scraping_at=None) on
    the success path must also carry the success fields."""
    sb = RunnerSB()
    runner_mod.run_scraping_pass(sb, source_ids=["src-1"], mock=True)
    updates = sb.db.get("source_registry_updates", [])

    release_updates = [u for u in updates if "currently_scraping_at" in u and u["currently_scraping_at"] is None]
    assert release_updates, "expected the claim to be released"
    # The merged PATCH: the release rides on the success update.
    for u in release_updates:
        assert u.get("last_success_at") is not None, (
            f"release was a standalone PATCH, not merged into mark_success: {u}"
        )
    # And there is no standalone release-only PATCH (one that clears the
    # claim without any success field).
    standalone_release = [
        u for u in release_updates
        if u.get("last_success_at") is None and u.get("last_scraped_at") is None
    ]
    assert not standalone_release, f"found standalone release PATCH(es): {standalone_release}"


# ════════════════════════════════════════════════════════════════════════
#  Task 4 — per-process source_registry host-match cache
# ════════════════════════════════════════════════════════════════════════


class _CountingRegistrySB:
    """Minimal supabase stub that counts unfiltered source_registry reads."""

    def __init__(self, rows):
        self._rows = rows
        self.select_calls = 0

    def table(self, name):
        assert name == "source_registry"
        return self

    def select(self, _cols):
        self.select_calls += 1
        return self

    def execute(self):
        class _R:
            pass
        r = _R()
        r.data = list(self._rows)
        return r


def test_registry_host_cache_serves_repeat_reads_within_ttl():
    drafts_mod.invalidate_source_registry_cache()
    sb = _CountingRegistrySB([{"id": "s1", "official_url": "https://a.gov.in/x"}])
    # First read hits the DB; subsequent reads within TTL are served from cache.
    drafts_mod._load_registry_for_host_match(sb)
    drafts_mod._load_registry_for_host_match(sb)
    drafts_mod._load_registry_for_host_match(sb)
    assert sb.select_calls == 1


def test_registry_host_cache_refetches_after_invalidate():
    drafts_mod.invalidate_source_registry_cache()
    sb = _CountingRegistrySB([{"id": "s1", "official_url": "https://a.gov.in/x"}])
    drafts_mod._load_registry_for_host_match(sb)
    assert sb.select_calls == 1
    drafts_mod.invalidate_source_registry_cache()
    drafts_mod._load_registry_for_host_match(sb)
    assert sb.select_calls == 2


def test_two_runs_share_cache_until_invalidated():
    """Contract: a second host-match within the TTL does 0 source_registry
    GETs unless a write invalidated the cache in between."""
    drafts_mod.invalidate_source_registry_cache()
    sb = _CountingRegistrySB([{"id": "s1", "official_url": "https://a.gov.in/x"}])
    # "run 1"
    drafts_mod._existing_by_host(sb, ["a.gov.in"])
    # "run 2" — cache hot, no new GET
    drafts_mod._existing_by_host(sb, ["a.gov.in"])
    assert sb.select_calls == 1


# ════════════════════════════════════════════════════════════════════════
#  Task 5 — low-confidence gate + per-source circuit breaker
# ════════════════════════════════════════════════════════════════════════


class _FakeSupabaseForLowConf:
    """Records source_registry updates + low_quality_extractions inserts.

    ``low_quality_table_exists=False`` makes the insert raise so we exercise
    the WARNING fallback path."""

    def __init__(self, *, low_quality_table_exists=False):
        self.low_quality_table_exists = low_quality_table_exists
        self.disabled_updates: list[dict] = []
        self.low_quality_inserts: list[dict] = []

    def table(self, name):
        return _FakeTable(self, name)


class _FakeTable:
    def __init__(self, parent, name):
        self.parent = parent
        self.name = name
        self._payload = None

    def insert(self, payload):
        if self.name == "low_quality_extractions":
            if not self.parent.low_quality_table_exists:
                raise RuntimeError('relation "low_quality_extractions" does not exist')
            self.parent.low_quality_inserts.append(payload)
        self._payload = payload
        return self

    def update(self, payload):
        self._payload = payload
        return self

    def eq(self, *_a, **_k):
        return self

    def execute(self):
        if self.name == "source_registry" and isinstance(self._payload, dict) and self._payload.get("is_active") is False:
            self.parent.disabled_updates.append(self._payload)

        class _R:
            data = []
        return _R()


def setup_function(_fn):
    runner_mod._low_confidence_strikes.clear()


def test_min_confidence_env_override(monkeypatch):
    monkeypatch.delenv("MIN_CONFIDENCE_TO_QUEUE", raising=False)
    assert runner_mod._min_confidence_to_queue() == runner_mod.MIN_CONFIDENCE_TO_QUEUE
    monkeypatch.setenv("MIN_CONFIDENCE_TO_QUEUE", "0.5")
    assert runner_mod._min_confidence_to_queue() == 0.5


def test_low_confidence_falls_back_to_warning_when_table_missing(caplog):
    sb = _FakeSupabaseForLowConf(low_quality_table_exists=False)
    import logging
    caplog.set_level(logging.WARNING, logger="career_copilot.scraping.runner")
    runner_mod._record_low_confidence_and_maybe_disable(
        sb, run_id="run-1", src={"id": "src-x"}, source_url="https://x",
        confidence=0.10, data_quality_score=0.25, extracted_data={},
    )
    assert any("low_confidence_skipped" in r.getMessage() for r in caplog.records)


def test_three_strikes_auto_disables_source(monkeypatch):
    monkeypatch.setenv("LOW_CONFIDENCE_STRIKE_LIMIT", "3")
    sb = _FakeSupabaseForLowConf()
    for _ in range(2):
        runner_mod._record_low_confidence_and_maybe_disable(
            sb, run_id="r", src={"id": "src-strike"}, source_url="u",
            confidence=0.10, data_quality_score=0.1, extracted_data={},
        )
    assert sb.disabled_updates == []  # not yet
    runner_mod._record_low_confidence_and_maybe_disable(
        sb, run_id="r", src={"id": "src-strike"}, source_url="u",
        confidence=0.10, data_quality_score=0.1, extracted_data={},
    )
    assert len(sb.disabled_updates) == 1
    assert sb.disabled_updates[0]["is_active"] is False
    assert sb.disabled_updates[0]["verification_status"] == "auto_disabled_low_confidence"


def test_strike_counter_resets_on_confident_run(monkeypatch):
    monkeypatch.setenv("LOW_CONFIDENCE_STRIKE_LIMIT", "3")
    sb = _FakeSupabaseForLowConf()
    # 0.10, 0.10, (reset), 0.10 → never reaches 3 consecutive.
    runner_mod._record_low_confidence_and_maybe_disable(
        sb, run_id="r", src={"id": "s"}, source_url="u",
        confidence=0.10, data_quality_score=0.1, extracted_data={},
    )
    runner_mod._record_low_confidence_and_maybe_disable(
        sb, run_id="r", src={"id": "s"}, source_url="u",
        confidence=0.10, data_quality_score=0.1, extracted_data={},
    )
    runner_mod._reset_low_confidence_strikes("s")  # a confident extraction
    runner_mod._record_low_confidence_and_maybe_disable(
        sb, run_id="r", src={"id": "s"}, source_url="u",
        confidence=0.10, data_quality_score=0.1, extracted_data={},
    )
    assert sb.disabled_updates == [], "reset should have prevented auto-disable"
