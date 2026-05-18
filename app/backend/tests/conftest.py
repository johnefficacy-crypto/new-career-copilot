"""Cross-test setup hooks for the backend test suite."""
from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _reset_per_exam_intelligence_cache():
    """Item 5's per-exam intelligence TTL cache lives at module scope.

    Without an autouse reset, one test populating the cache for
    ``ssc-cgl`` would leak into the next test that uses the same target
    with different seed data. Clear before each test so behaviour is
    deterministic.
    """
    try:
        from app.study_os.mission_control import invalidate_per_exam_intelligence
    except ImportError:
        # Import path not available for tests that don't depend on
        # mission_control (e.g. early-stage modules). Silently skip.
        yield
        return
    invalidate_per_exam_intelligence()
    yield
    invalidate_per_exam_intelligence()


@pytest.fixture(autouse=True)
def _reset_persona_bank_cache():
    """The question-bank TTL cache (cachetools, 5min) lives at module scope.

    Stub Supabase instances differ per test, so a cached row list from
    test A would be served to test B even though B seeded a different
    bank. Clear before and after each test.
    """
    try:
        from app.persona_questions.bank import invalidate_bank_cache
    except ImportError:
        yield
        return
    invalidate_bank_cache()
    yield
    invalidate_bank_cache()
