"""Every ``event_type`` the app writes into ``study_adaptation_events``
must be admitted by the migration CHECK constraint.

This is the guard that would have caught the ``manual_application`` bug
(fixed in PR #367) and the ``mock_reviewed`` / ``admin_apply`` family
(fixed in migration 121). It parses the latest CHECK list out of the
migration SQL and asserts the code's literal event_types are a subset.
"""
from __future__ import annotations

import re
from pathlib import Path

# Repo paths relative to this test file: app/backend/tests/study_os/...
_BACKEND = Path(__file__).resolve().parents[2]
_REPO = _BACKEND.parents[1]
_MIGRATIONS = _REPO / "app" / "supabase" / "migrations"


def _allowed_event_types() -> set[str]:
    """Union of every event_type listed in any migration's
    ``study_adaptation_events`` CHECK. Union (not last-wins) keeps the
    parse robust to how 033 defined the column inline and 121 re-created
    the constraint."""
    allowed: set[str] = set()
    for sql_path in sorted(_MIGRATIONS.glob("*.sql")):
        text = sql_path.read_text(encoding="utf-8")
        if "study_adaptation_events" not in text:
            continue
        # Find every `event_type in ( ... )` block and collect quoted values.
        for block in re.findall(r"event_type\s+in\s*\(([^)]*)\)", text, re.IGNORECASE):
            allowed.update(re.findall(r"'([a-z_]+)'", block))
    return allowed


def _code_event_types() -> dict[str, list[str]]:
    """Map ``event_type`` literal → files that pass it, scanning the
    backend app for ``event_type="..."`` arguments. We exclude the
    aggregator-listing path in scraping/runner.py, which writes to a
    different table, not study_adaptation_events."""
    app_dir = _BACKEND / "app"
    found: dict[str, list[str]] = {}
    literal_re = re.compile(r'event_type\s*=\s*"([a-z_]+)"')
    for py in app_dir.rglob("*.py"):
        rel = str(py.relative_to(_BACKEND))
        # runner.py's new_recruitment goes to aggregator listings, not the
        # study adaptation table — out of scope for this constraint.
        if rel.endswith("scraping/runner.py"):
            continue
        for m in literal_re.finditer(py.read_text(encoding="utf-8")):
            found.setdefault(m.group(1), []).append(rel)
    return found


def test_migration_admits_expanded_event_types():
    allowed = _allowed_event_types()
    # Sanity: the parse actually found the set.
    assert "manual_regeneration" in allowed
    # The labels migration 121 adds.
    for et in ("mock_reviewed", "admin_apply", "admin_skip_task", "admin_reset_carry_forward"):
        assert et in allowed, f"migration CHECK is missing {et!r}"


def test_no_code_event_type_violates_the_check():
    allowed = _allowed_event_types()
    code = _code_event_types()
    violations = {et: files for et, files in code.items() if et not in allowed}
    assert not violations, (
        "These event_type literals are written by the app but are not in any "
        f"study_adaptation_events CHECK migration: {violations}"
    )


def test_manual_application_is_gone():
    """Regression: the illegal default fixed in PR #367 must never return."""
    code = _code_event_types()
    assert "manual_application" not in code
