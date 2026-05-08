from pathlib import Path


def test_no_duplicate_async_function_definitions():
    src = Path('app/eligibility/runner.py').read_text()
    assert src.count('async def get_eligible_recruitments_async') == 1
    assert src.count('async def get_all_eligibility_results_async') == 1


def test_no_asyncio_to_thread_in_eligibility_runner():
    src = Path('app/eligibility/runner.py').read_text()
    assert 'asyncio.to_thread' not in src
