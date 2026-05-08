import asyncio

from app.db import utils


def test_async_safe_select_delegates_to_safe_select(monkeypatch):
    calls = {}

    def _fake_safe_select(supabase, table, columns, **filters):
        calls["args"] = (supabase, table, columns, filters)
        return [{"ok": True}]

    monkeypatch.setattr(utils, "safe_select", _fake_safe_select)
    out = asyncio.run(utils.async_safe_select(object(), "profiles", "*", id="u1"))
    assert out == [{"ok": True}]
    assert calls["args"][1:] == ("profiles", "*", {"id": "u1"})

