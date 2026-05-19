"""Profile completion fan-out must run in parallel, not sequentially.

`profile_completion` issues eight independent Supabase reads. Done
serially they cost ~150 ms × 8 ≈ 1.2 s on dashboard boot. The endpoint
must wrap each blocking call in ``asyncio.to_thread`` and gather them,
so total wall time stays close to one round-trip even under load.

This test monkeypatches each fetcher with a 100 ms sleep and asserts
the endpoint finishes well under the sequential budget.
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

    monkeypatch.setattr(canonical, "_ensure_profile_row", _sleep_returning(profile_row))
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

    # Serial would be ~0.8 s; parallel should be ~0.1 s plus thread-pool
    # overhead. Give ourselves a 200 ms ceiling above that to keep the
    # test stable under CI jitter — still well below the 0.8 s serial
    # floor, so a regression is unmissable.
    assert elapsed < 0.3, f"profile_completion ran sequentially: {elapsed:.3f}s"
