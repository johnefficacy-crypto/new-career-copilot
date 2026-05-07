from __future__ import annotations

import asyncio
from datetime import date, timedelta

from app.notifications import next_actions


class _Exec:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, table_name, db):
        self.table_name = table_name
        self.db = db
        self.filters = {}

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, k, v):
        self.filters[k] = v
        return self

    def gte(self, *_args, **_kwargs):
        return self

    def lt(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def insert(self, payload):
        self.db[self.table_name].append(payload)
        return self
    def upsert(self, payload, on_conflict=None):
        if on_conflict == "dedupe_key" and payload.get("dedupe_key"):
            existing = [r for r in self.db[self.table_name] if r.get("dedupe_key") == payload["dedupe_key"]]
            if not existing:
                self.db[self.table_name].append(payload)
        else:
            self.db[self.table_name].append(payload)
        return self

    def execute(self):
        rows = self.db[self.table_name]
        if self.filters:
            rows = [r for r in rows if all(r.get(k) == v for k, v in self.filters.items())]
        return _Exec(rows)


class FakeSupabase:
    def __init__(self):
        self.db = {"notification_alerts": [], "notification_preferences": []}

    def table(self, name):
        return _Query(name, self.db)


def _rec(stage, end_days=5):
    return {
        "recruitment_id": f"rec-{stage}",
        "slug": f"rec-{stage}",
        "name": "Rec",
        "recommendation_stage": stage,
        "next_action": "Action",
        "apply_end_date": (date.today() + timedelta(days=end_days)).isoformat(),
    }


def test_no_duplicate_notification_same_day(monkeypatch):
    sb = FakeSupabase()
    sb.db["notification_alerts"].append({"user_id": "u1", "recruitment_id": "rec-continue_application", "alert_type": "continue_application", "sent_at": f"{date.today().isoformat()}T10:00:00", "dedupe_key": "u1:rec-continue_application:continue_application:"+date.today().isoformat()})

    async def fake_recs(user):
        return {"items": [_rec("continue_application")], "counts": {}}

    async def fake_review(user):
        return {"backlog_count": 0, "missed_tasks": 0, "hours_planned": 0}

    async def fake_completion(user):
        return {"eligibility_profile": {"completion_pct": 100}}

    monkeypatch.setattr(next_actions, "my_recommendations", fake_recs)
    monkeypatch.setattr(next_actions, "weekly_review", fake_review)
    monkeypatch.setattr(next_actions, "profile_completion", fake_completion)

    out = asyncio.run(next_actions.generate_next_actions_for_user(supabase=sb, user={"id": "u1"}))
    assert out["created"] == 0
    assert out["skipped"] >= 1


def test_priority_and_types(monkeypatch):
    sb = FakeSupabase()

    async def fake_recs(user):
        return {"items": [_rec("continue_application", end_days=1), _rec("prepare_after_submission"), _rec("complete_profile"), _rec("submit_form")], "counts": {}}

    async def fake_review(user):
        return {"backlog_count": 5, "missed_tasks": 1, "hours_planned": 2}

    async def fake_completion(user):
        return {"eligibility_profile": {"completion_pct": 50}}

    monkeypatch.setattr(next_actions, "my_recommendations", fake_recs)
    monkeypatch.setattr(next_actions, "weekly_review", fake_review)
    monkeypatch.setattr(next_actions, "profile_completion", fake_completion)

    out = asyncio.run(next_actions.generate_next_actions_for_user(supabase=sb, user={"id": "u2"}))
    types = {x["alert_type"]: x for x in sb.db["notification_alerts"]}
    assert out["created"] >= 4
    assert types["continue_application"]["priority"] >= 3
    assert "prepare_after_submission" in types
    assert "complete_profile" in types
    assert "study_backlog_recovery" in types


def test_dry_run_creates_no_rows(monkeypatch):
    sb = FakeSupabase()
    async def fake_recs(user): return {"items": [_rec("continue_application")], "counts": {}}
    async def fake_review(user): return {"backlog_count": 0, "missed_tasks": 0, "hours_planned": 0}
    async def fake_completion(user): return {"eligibility_profile": {"completion_pct": 100}}
    monkeypatch.setattr(next_actions, "my_recommendations", fake_recs)
    monkeypatch.setattr(next_actions, "weekly_review", fake_review)
    monkeypatch.setattr(next_actions, "profile_completion", fake_completion)
    out = asyncio.run(next_actions.generate_next_actions_for_user(supabase=sb, user={"id": "u3"}, dry_run=True))
    assert out["created"] == 0
    assert len(sb.db["notification_alerts"]) == 0
    assert out["by_type"]["continue_application"] == 1


def test_disabled_type_is_skipped(monkeypatch):
    sb = FakeSupabase()
    sb.db["notification_preferences"].append({"user_id": "u4", "in_app_types_disabled": ["continue_application"], "min_priority_in_app": "low"})
    async def fake_recs(user): return {"items": [_rec("continue_application")], "counts": {}}
    async def fake_review(user): return {"backlog_count": 0, "missed_tasks": 0, "hours_planned": 0}
    async def fake_completion(user): return {"eligibility_profile": {"completion_pct": 100}}
    monkeypatch.setattr(next_actions, "my_recommendations", fake_recs)
    monkeypatch.setattr(next_actions, "weekly_review", fake_review)
    monkeypatch.setattr(next_actions, "profile_completion", fake_completion)
    out = asyncio.run(next_actions.generate_next_actions_for_user(supabase=sb, user={"id": "u4"}))
    assert out["created"] == 0

def test_min_priority_skips_low(monkeypatch):
    sb = FakeSupabase()
    sb.db["notification_preferences"].append({"user_id": "u5", "min_priority_in_app": "high", "in_app_types_disabled": []})
    async def fake_recs(user): return {"items": [_rec("prepare_after_submission", end_days=10)], "counts": {}}
    async def fake_review(user): return {"backlog_count": 0, "missed_tasks": 0, "hours_planned": 0}
    async def fake_completion(user): return {"eligibility_profile": {"completion_pct": 100}}
    monkeypatch.setattr(next_actions, "my_recommendations", fake_recs)
    monkeypatch.setattr(next_actions, "weekly_review", fake_review)
    monkeypatch.setattr(next_actions, "profile_completion", fake_completion)
    out = asyncio.run(next_actions.generate_next_actions_for_user(supabase=sb, user={"id": "u5"}))
    assert out["created"] == 0
