import asyncio
from pathlib import Path
from types import SimpleNamespace

from app.eligibility import runner


def test_no_duplicate_async_function_definitions():
    src = Path('app/eligibility/runner.py').read_text()
    assert src.count('async def get_eligible_recruitments_async') == 1
    assert src.count('async def get_all_eligibility_results_async') == 1


def test_no_asyncio_to_thread_in_eligibility_runner():
    src = Path('app/eligibility/runner.py').read_text()
    assert 'asyncio.to_thread' not in src


class _AsyncQuery:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *_a, **_k): return self
    def eq(self, *_a, **_k): return self
    def or_(self, *_a, **_k): return self
    def order(self, *_a, **_k): return self
    async def execute(self): return SimpleNamespace(data=self._rows)


class _AsyncSupabase:
    def __init__(self, rows):
        self._rows = rows
    def table(self, _name): return _AsyncQuery(self._rows)


def test_async_result_helpers_return_rows_for_async_client():
    rows = [{"post_id": "p1", "recruitment_id": "r1", "is_eligible": True}]
    sb = _AsyncSupabase(rows)
    out1 = asyncio.run(runner.get_eligible_recruitments_async("u1", sb))  # type: ignore[arg-type]
    out2 = asyncio.run(runner.get_all_eligibility_results_async("u1", sb))  # type: ignore[arg-type]
    assert out1 == rows
    assert out2 == rows


# ── #4 read-side surfacing of persisted `checks` ─────────────────────────────


def test_result_selects_include_checks_column():
    # `checks` JSONB is persisted on every recompute (#129). Without it in
    # the read selectors, admin/audit UI can't render the rule-by-rule
    # verdict without re-running the engine.
    assert "checks" in runner._RESULT_SELECT
    assert "checks" in runner._RESULT_SELECT_ALL


class _CapturingQuery:
    """Records the select string passed in so we can assert on it."""

    captured: dict[str, str] = {}

    def __init__(self, rows):
        self._rows = rows

    def select(self, sel, *_a, **_k):
        _CapturingQuery.captured["select"] = sel
        return self

    def eq(self, *_a, **_k): return self
    def or_(self, *_a, **_k): return self
    def order(self, *_a, **_k): return self
    def execute(self):
        return SimpleNamespace(data=self._rows)


class _CapturingSB:
    def __init__(self, rows):
        self._rows = rows

    def table(self, _name):
        return _CapturingQuery(self._rows)


def test_get_eligible_recruitments_select_string_includes_checks():
    _CapturingQuery.captured.clear()
    runner.get_eligible_recruitments("u1", _CapturingSB([]))
    assert "checks" in _CapturingQuery.captured["select"]


def test_get_all_eligibility_results_select_string_includes_checks():
    _CapturingQuery.captured.clear()
    runner.get_all_eligibility_results("u1", _CapturingSB([]))
    assert "checks" in _CapturingQuery.captured["select"]


def test_get_eligible_recruitments_passes_checks_payload_through():
    # Sanity check that the helper round-trips a row carrying `checks` —
    # makes sure no downstream filter strips it before reaching the caller.
    rows = [{
        "post_id": "p1",
        "recruitment_id": "r1",
        "is_eligible": False,
        "is_conditional": True,
        "fail_reasons": ["Below 60%"],
        "checks": [
            {"rule": "age", "passed": True, "detail": "Age 24 in range", "is_unverifiable": False},
            {"rule": "education", "passed": False, "detail": "Below 60%", "is_unverifiable": False},
            {"rule": "nationality", "passed": False, "detail": "Not provided",
             "is_unverifiable": True},
        ],
    }]
    sb = _CapturingSB(rows)
    out = runner.get_eligible_recruitments("u1", sb)
    assert out == rows
    assert "checks" in out[0]
    assert len(out[0]["checks"]) == 3
    assert any(c.get("is_unverifiable") for c in out[0]["checks"])
