"""Anonymous-user cleanup job — picks only expired anonymous rows."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.profile.anonymous_cleanup import cleanup_anonymous_users
from tests.persona_questions._stub import SBStub


class _FakeAuthAdmin:
    def __init__(self):
        self.deleted: list[str] = []

    def delete_user(self, user_id: str) -> None:
        self.deleted.append(user_id)


class _FakeAuth:
    def __init__(self):
        self.admin = _FakeAuthAdmin()


class _AuthAwareStub(SBStub):
    def __init__(self, db):
        super().__init__(db)
        self.auth = _FakeAuth()


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def test_cleanup_deletes_old_anonymous_only():
    now = datetime(2026, 5, 18, 0, 0, 0, tzinfo=timezone.utc)
    old_anon = _iso(now - timedelta(days=45))
    fresh_anon = _iso(now - timedelta(days=5))
    old_real = _iso(now - timedelta(days=400))

    sb = _AuthAwareStub(
        {
            "profiles": [
                {"id": "anon-old", "is_anonymous": True, "created_at": old_anon},
                {"id": "anon-young", "is_anonymous": True, "created_at": fresh_anon},
                {"id": "real-old", "is_anonymous": False, "created_at": old_real},
            ]
        }
    )

    result = cleanup_anonymous_users(sb, now=now)
    assert result["deleted"] == 1
    assert result["checked"] == 1
    ids = [r["id"] for r in sb.db["profiles"]]
    # The old anonymous row is gone; the fresh anon + real users stay.
    assert "anon-old" not in ids
    assert "anon-young" in ids
    assert "real-old" in ids
    assert sb.auth.admin.deleted == ["anon-old"]


def test_cleanup_with_no_anonymous_users_is_a_noop():
    sb = _AuthAwareStub(
        {"profiles": [{"id": "real-1", "is_anonymous": False, "created_at": "2026-01-01"}]}
    )
    result = cleanup_anonymous_users(sb)
    assert result["deleted"] == 0
    assert result["checked"] == 0
    assert sb.auth.admin.deleted == []
