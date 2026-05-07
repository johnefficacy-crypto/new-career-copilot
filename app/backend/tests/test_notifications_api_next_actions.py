import asyncio

from app.api import notifications


class _Exec:
    def __init__(self, data):
        self.data = data


class _Q:
    def __init__(self, name, db):
        self.name = name
        self.db = db
        self.filters = {}
    def select(self, *_a, **_k): return self
    def limit(self, n): self._limit=n; return self
    def eq(self, k, v): self.filters[k] = v; return self
    def order(self, *_a, **_k): return self
    def insert(self, payload):
        row = {**payload}
        row["id"] = row.get("id", f"run-{len(self.db.get(self.name, []))+1}")
        self.db.setdefault(self.name, []).append(row)
        return self
    def update(self, payload):
        for row in self.db.get(self.name, []):
            if all(row.get(k) == v for k, v in self.filters.items()):
                row.update(payload)
        return self
    def execute(self):
        rows = self.db.get(self.name, [])
        if self.filters:
            rows = [r for r in rows if all(r.get(k) == v for k, v in self.filters.items())]
        return _Exec(rows[: getattr(self, '_limit', 9999)])


class _SB:
    def __init__(self):
        self.db = {
            "profiles": [{"id": "u1"}, {"id": "u2"}, {"id": "u3"}],
            "notification_generation_runs": [],
        }
    def table(self, name): return _Q(name, self.db)


def test_generate_next_actions_all_users_limit_and_counts(monkeypatch):
    sb = _SB()
    monkeypatch.setattr(notifications, "get_supabase_admin", lambda: sb)

    async def fake_gen(supabase, user, dry_run=False):
        return {"created": 0 if dry_run else 1, "skipped": 0, "candidates": 1, "by_type": {"continue_application": 1}}

    monkeypatch.setattr(notifications, "generate_next_actions_for_user", fake_gen)
    body = notifications.GenerateNextActionsBody(scope="all_users", limit=2, dry_run=True)
    out = asyncio.run(notifications.generate_next_actions(body=body, actor={"id": "admin"}))
    assert out["users"] == 2
    assert out["dry_run"] is True
    assert out["created"] == 0
    assert out["by_type"]["continue_application"] == 2
    assert len(sb.db["notification_generation_runs"]) == 1
    assert sb.db["notification_generation_runs"][0]["status"] == "success"
    assert sb.db["notification_generation_runs"][0]["created_count"] == 0


def test_generate_next_actions_failed_run_log(monkeypatch):
    sb = _SB()
    monkeypatch.setattr(notifications, "get_supabase_admin", lambda: sb)
    async def boom(*_a, **_k): raise RuntimeError("boom")
    monkeypatch.setattr(notifications, "generate_next_actions_for_user", boom)
    body = notifications.GenerateNextActionsBody(scope="all_users", limit=1, dry_run=False)
    try:
        asyncio.run(notifications.generate_next_actions(body=body, actor={"id": "admin"}))
        assert False, "expected exception"
    except RuntimeError:
        pass
    assert sb.db["notification_generation_runs"][0]["status"] == "failed"
    assert "boom" in sb.db["notification_generation_runs"][0]["error_message"]


def test_my_alerts_shaping_and_recruitment_link(monkeypatch):
    monkeypatch.setattr(notifications, "get_supabase_admin", lambda: None)
    monkeypatch.setattr(
        notifications,
        "get_user_alerts",
        lambda *_a, **_k: [{"alert_type": "continue_application", "priority": 3, "is_read": False, "sent_at": "2026-05-07T00:00:00Z", "recruitment_id": "rid", "recruitment": {"slug": "exam-1", "organization": {"name": "Org"}}, "title": "T", "body": "B"}],
    )
    out = notifications.my_alerts(user={"id": "u"})
    assert out["items"][0]["title"] == "T"
    assert out["items"][0]["body"] == "B"
    assert out["items"][0]["recruitment_link"] == "/app/exams/exam-1"
