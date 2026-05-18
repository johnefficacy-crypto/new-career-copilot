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
