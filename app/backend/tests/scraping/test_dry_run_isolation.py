"""Dry-run isolation (PR: scraper-quality-gates #1).

A dry-run (``mock=True``) shares ``run_scraping_pass`` and ``scrape_queue``
with the real ``/run`` path. Synthetic output must be tagged and kept out of
every review / promotion / dedup path so it can never look like a real,
promotable candidate (the 2026-05-16 leak: 96 mock rows in the live queue).
"""
from __future__ import annotations

import pytest

from app.scraping import runner as runner_mod
from app.scraping.promotion_gate import evaluate_promotion_gate
from app.scraping.runner import promote_run, run_scraping_pass
from tests.test_scrape_runner_promote import E, RunnerSB


# ── Tagging: dry-run rows + run are flagged and given a terminal status ──────


def test_dry_run_pass_flags_run_and_queue_rows():
    sb = RunnerSB()
    run_scraping_pass(sb, source_ids=["src-1"], mock=True)

    run_row = sb.db["scrape_runs"][0]
    assert run_row["is_dry_run"] is True

    queue_rows = sb.db["scrape_queue"]
    assert queue_rows
    for row in queue_rows:
        assert row["is_dry_run"] is True
        # Terminal status that the existing status='pending' review filters
        # exclude — never 'pending'/'duplicate'.
        assert row["status"] == "dry_run"


def test_live_pass_does_not_flag_rows(monkeypatch):
    sb = RunnerSB()
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")
    monkeypatch.setattr("app.scraping.runner.fetch_page_html", lambda _url: '<a href="/recruitment-one/">Recruitment one</a>')
    monkeypatch.setattr("app.scraping.runner.fetch_page_text", lambda url: f"Recruitment notice for {url}")
    monkeypatch.setattr("app.scraping.runner.resolve_with_registry", lambda *_a, **_kw: None)

    run_scraping_pass(sb, source_ids=["src-1"], limit=1, mock=False)

    assert sb.db["scrape_runs"][0]["is_dry_run"] is False
    for row in sb.db["scrape_queue"]:
        assert row["is_dry_run"] is False
        assert row["status"] in {"pending", "duplicate"}


# ── Dedup: a real run must not dedup against dry-run rows ────────────────────


def test_dedup_read_excludes_dry_run_rows():
    """The open-queue dedup read must filter out ``dry_run`` status so a real
    run never collapses a genuine candidate into a synthetic preview row."""
    captured: dict[str, object] = {}

    class _DedupSB(RunnerSB):
        def table(self, name):
            q = super().table(name)
            if name == "scrape_queue":
                orig_not_in = q.in_

                # The dedup read is the only ``not_.in_("status", ...)`` call.
                def _record_in(key, values):
                    if key == "status":
                        captured["status_exclusions"] = set(values)
                    return orig_not_in(key, values)

                q.in_ = _record_in
            return q

    sb = _DedupSB()
    run_scraping_pass(sb, source_ids=["src-1"], mock=True)
    assert "dry_run" in captured.get("status_exclusions", set())


# ── Promotion gate: hard, non-overridable block on dry-run rows ──────────────


def test_promotion_gate_blocks_dry_run_row():
    item = {
        "id": "queue-dry",
        "is_dry_run": True,
        "official_source_resolved": True,
        "extracted_data": {"title": "x", "organization_name": "y", "year": 2026},
    }

    class _SB:
        def table(self, _name):
            raise AssertionError("gate must short-circuit before any DB read")

    res = evaluate_promotion_gate(_SB(), item)
    assert res.ok is False
    assert res.reason == "dry_run_not_promotable"


def test_promote_run_skips_dry_run_rows_via_status_filter():
    """``promote_run`` filters ``status='pending'``; a dry-run row
    (``status='dry_run'``) is never even selected for promotion."""
    db = {
        "scrape_queue": [
            {
                "id": "queue-dry",
                "scrape_run_id": "run-1",
                "source_id": "src-1",
                "status": "dry_run",
                "is_dry_run": True,
                "official_source_resolved": True,
                "extracted_data": {
                    "title": "Synthetic", "organization_name": "Mock Org",
                    "org_type": "Other", "year": 2026,
                    "official_notification_url": "https://x",
                },
            }
        ],
    }

    class _Q:
        def __init__(self, name, db):
            self.name = name; self.db = db; self.filters = {}; self.payload = None
        def select(self, *a, **k): return self
        def eq(self, k, v): self.filters[k] = v; return self
        def in_(self, k, v): return self
        def order(self, *a, **k): return self
        def limit(self, *a, **k): return self
        def update(self, p): self.payload = p; return self
        def execute(self):
            if self.name == "scrape_queue":
                rows = list(self.db.get("scrape_queue", []))
                if "scrape_run_id" in self.filters:
                    rows = [r for r in rows if r["scrape_run_id"] == self.filters["scrape_run_id"]]
                if "status" in self.filters:
                    rows = [r for r in rows if r["status"] == self.filters["status"]]
                return E(rows)
            return E([])

    class _SB:
        def __init__(self, db): self.db = db
        def table(self, name): return _Q(name, self.db)

    out = promote_run("run-1", _SB(db))
    assert out["promoted"] == 0
    assert out["failed"] == 0
    assert out["skipped"] == 0  # filtered before the gate even runs
    assert "recruitments" not in db
