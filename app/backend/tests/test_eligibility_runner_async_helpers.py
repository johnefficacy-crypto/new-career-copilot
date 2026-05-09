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
