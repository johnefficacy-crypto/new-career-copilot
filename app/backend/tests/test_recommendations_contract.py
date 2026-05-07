import asyncio
from datetime import date, timedelta

import pytest

from app.api import canonical


def _rec(start_delta=-2, end_delta=10):
    return {
        "id": "rec-1",
        "slug": "rec-1",
        "name": "Test Recruitment",
        "organization": "Org",
        "apply_start_date": (date.today() + timedelta(days=start_delta)).isoformat(),
        "apply_end_date": (date.today() + timedelta(days=end_delta)).isoformat(),
        "apply_window": {
            "open": (date.today() + timedelta(days=start_delta)).isoformat(),
            "close": (date.today() + timedelta(days=end_delta)).isoformat(),
        },
        "saved": False,
    }


def _profile(**overrides):
    base = {"date_of_birth": "2000-01-01", "category": "general", "graduation_year": 2022}
    base.update(overrides)
    return base


@pytest.mark.parametrize(
    "application, rec, eligibility, profile, expected_stage",
    [
        ({"clicked_apply_at": "2026-01-01T00:00:00Z", "submitted_at": None, "status": "opened"}, _rec(), {"eligible": True}, _profile(), "continue_application"),
        ({"status": "in_progress", "submitted_at": None}, _rec(), {"eligible": True}, _profile(), "submit_form"),
        ({"submitted_at": "2026-01-01T00:00:00Z", "status": "submitted"}, _rec(end_delta=10), {"eligible": True}, _profile(), "prepare_after_submission"),
        ({"submitted_at": "2026-01-01T00:00:00Z", "status": "submitted"}, _rec(end_delta=-1), {"eligible": True}, _profile(), "monitor_result"),
        ({"status": "opened", "submitted_at": None}, _rec(end_delta=-1), {"eligible": True}, _profile(), "closed"),
        ({"status": "opened", "submitted_at": None}, _rec(), {"eligible": True}, _profile(category=None), "complete_profile"),
        ({"status": "opened", "submitted_at": None}, _rec(), {"eligible": False, "conditional": False}, _profile(), "check_eligibility"),
        ({"status": "opened", "submitted_at": None}, _rec(start_delta=2, end_delta=15), {"eligible": True}, _profile(), "low_priority"),
        ({"status": "not_started", "submitted_at": None}, _rec(), {"eligible": True}, _profile(), "apply_now"),
    ],
)
def test_rank_recruitment_stage_matrix(application, rec, eligibility, profile, expected_stage):
    out = canonical._rank_recruitment(rec, profile, eligibility, application, backlog_high=False)
    assert out["recommendation_stage"] == expected_stage


def test_continue_application_exact_text():
    out = canonical._rank_recruitment(
        _rec(),
        _profile(),
        {"eligible": True},
        {"clicked_apply_at": "2026-01-01T00:00:00Z", "submitted_at": None, "status": "opened"},
        backlog_high=False,
    )
    assert out["next_action"] == "Complete or update your application status."


def test_recommendations_counts(monkeypatch):
    recs = [
        {**_rec(), "id": "a", "slug": "a", "name": "A"},
        {**_rec(), "id": "b", "slug": "b", "name": "B"},
        {**_rec(end_delta=-1), "id": "c", "slug": "c", "name": "C"},
    ]

    async def fake_list_recruitments(user=None, status=None, q=None):
        return {"items": recs, "counts": {"all": 3}}

    async def fake_get_profile(user):
        return _profile()

    async def fake_weekly_review(user):
        return {"backlog_count": 0, "missed_tasks": 0}

    class _DummySupabase:
        pass

    monkeypatch.setattr(canonical, "list_recruitments", fake_list_recruitments)
    monkeypatch.setattr(canonical, "get_profile", fake_get_profile)
    monkeypatch.setattr(canonical, "weekly_review", fake_weekly_review)
    monkeypatch.setattr(canonical, "get_supabase_admin", lambda: _DummySupabase())
    monkeypatch.setattr(canonical, "_eligibility_summary", lambda s, u: {"a": {"eligible": True}, "b": {"eligible": True}, "c": {"eligible": True}})
    monkeypatch.setattr(
        canonical,
        "_safe",
        lambda call, default=None: [
            {"recruitment_id": "b", "clicked_apply_at": "2026-01-01T00:00:00Z", "submitted_at": None, "status": "opened"},
            {"recruitment_id": "c", "submitted_at": None, "status": "opened"},
        ],
    )

    out = asyncio.run(canonical.my_recommendations(user={"id": "u1"}))
    assert out["counts"]["apply_now"] == 1
    assert out["counts"]["continue_application"] == 1
    assert out["counts"]["closed"] == 1
