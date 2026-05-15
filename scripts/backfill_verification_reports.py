#!/usr/bin/env python3
"""CLI entry point for the soft-backfill driver.

Usage:

    python scripts/backfill_verification_reports.py [--max N] [--page-size N] [--dry-run]

The script connects to Supabase via the same admin client the FastAPI
server uses (``app.db.supabase_client.get_supabase_admin``) and walks
every published recruitment, writing one verification report per row.

Dry-run mode prints what *would* happen but doesn't call into the
gateway service — useful for an operator who wants to confirm row
counts before the first real pass.
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path


def _bootstrap_path() -> None:
    # Allow running the script directly from the repo root without an
    # editable install. The backend uses ``pythonpath = .`` in pytest.ini
    # for the same reason; we replicate it here.
    repo_root = Path(__file__).resolve().parent.parent
    sys.path.insert(0, str(repo_root / "app" / "backend"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Soft backfill verification reports.")
    parser.add_argument("--max", type=int, default=None, help="Cap on recruitments processed.")
    parser.add_argument("--page-size", type=int, default=200, help="Cursor page size.")
    parser.add_argument("--dry-run", action="store_true", help="Count only, do not write.")
    parser.add_argument("--verbose", "-v", action="store_true", help="DEBUG-level logging.")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    logger = logging.getLogger("backfill_verification_reports")

    _bootstrap_path()
    from app.db.supabase_client import get_supabase_admin
    from app.scraping.verification_backfill import (
        iter_published_recruitments,
        run_backfill,
    )

    supabase = get_supabase_admin()

    if args.dry_run:
        count = 0
        for _ in iter_published_recruitments(supabase, page_size=args.page_size):
            count += 1
            if args.max is not None and count >= args.max:
                break
        logger.info("dry_run.complete would_process=%d", count)
        return 0

    stats = run_backfill(
        supabase,
        page_size=args.page_size,
        max_recruitments=args.max,
    )
    logger.info(
        "backfill.summary seen=%d created=%d noop=%d tier_a_needs_review=%d "
        "skipped=%d errors=%d",
        stats.total_seen,
        stats.created,
        stats.noop,
        stats.tier_a_needs_review,
        stats.skipped_missing_id,
        stats.errors,
    )
    if stats.errors:
        logger.warning("backfill.error_ids %s", stats.error_ids[:20])
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
