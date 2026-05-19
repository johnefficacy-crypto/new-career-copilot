"""Profile completion fan-out must parallelise the optional reads.

`profile_completion` issues eight independent Supabase reads. The
identity (profile) read runs first so the supabase-py sync client
doesn't race eight concurrent requests over one httpx connection; the
remaining seven reads still gather. Sequential is ~150 ms × 8 ≈ 1.2 s,
the current shape is ~150 ms (profile) + ~150 ms (rest), which keeps
dashboard boot fast while avoiding the "Server disconnected" warnings
the old fully-parallel form produced.
"""
from __future__ import annotations

import asyncio
import time

from app.api import canonical


def _user() -> dict:
    return {"id": "u-1", "email": "u@example.com"}


class _SBStub:
    """Inert supabase; the fetcher monkeypatches are what actually sleep."""

    def table(self, _name):  # pragma: no cover - never reached in this test
        raise AssertionError(
            "fetcher was not monkeypatched; supabase.table() must not be called"
        )


def _sleep_returning(value):
    def _inner(*_args, **_kwargs):
        time.sleep(0.1)
        return value
    return _inner


def test_profile_completion_runs_eight_fetchers_in_parallel(monkeypatch):
    monkeypatch.setattr(canonical, "get_supabase_admin", lambda: _SBStub())

    profile_row = {
        "full_name": "A",
        "phone": "9",
        "date_of_birth": "2000-01-01",
        "category": "general",
        "domicile_state": "Karnataka",
        "nationality": "Indian",
        "govt_employee": False,
        "weekly_hours_goal": 14,
    }
    education_row = {"qualification": "B.A.", "qualification_year": 2022}
    prefs_row = {
        "target_exams": ["ssc"],
        "preferred_states": ["KA"],
        "study_hours_per_day": 2.0,
    }
    location_row = {"state": "Karnataka"}
    reservations_row = {"category": "general"}

    monkeypatch.setattr(canonical, "_read_profile_row", _sleep_returning(profile_row))
    monkeypatch.setattr(canonical, "_get_primary_education", _sleep_returning(education_row))
    monkeypatch.setattr(canonical, "_get_preferences", _sleep_returning(prefs_row))
    monkeypatch.setattr(canonical, "_get_location", _sleep_returning(location_row))
    monkeypatch.setattr(canonical, "_get_reservations", _sleep_returning(reservations_row))
    monkeypatch.setattr(canonical, "_count_certifications", _sleep_returning([{"id": "c1"}]))
    monkeypatch.setattr(canonical, "_count_experience", _sleep_returning([{"id": "e1"}]))
    monkeypatch.setattr(canonical, "_count_exam_attempts", _sleep_returning([{"id": "a1"}]))

    started = time.perf_counter()
    out = asyncio.run(canonical.profile_completion(user=_user()))
    elapsed = time.perf_counter() - started

    # Sanity: response shape preserved.
    assert "identity_profile" in out
    assert "certification_profile" in out
    assert out["certification_profile"]["completion_pct"] == 100
    assert out["experience_profile"]["completion_pct"] == 100
    assert out["attempts_profile"]["completion_pct"] == 100

    # Fully serial would be ~0.8 s; the current shape is one serial
    # profile read (~0.1 s) plus a parallel gather of the remaining
    # seven (~0.1 s) — call it 0.25 s with thread-pool overhead. Below
    # 0.4 s catches any regression that re-serialises the gather.
    assert elapsed < 0.4, f"profile_completion ran sequentially: {elapsed:.3f}s"
