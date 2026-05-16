"""Tiny in-memory Supabase stub shared across persona_questions tests."""
from __future__ import annotations

from typing import Any


class _Exec:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, name, db):
        self.name = name
        self.db = db
        self.filters: list[tuple[str, str, Any]] = []
        self._order_key: str | None = None
        self._desc = False
        self._limit: int | None = None
        self._pending_insert: Any = None
        self._pending_update: dict[str, Any] | None = None
        self._pending_upsert: Any = None
        self._on_conflict: list[str] | None = None

    def select(self, *args, **kwargs):
        return self

    def eq(self, key, val):
        self.filters.append((key, "eq", val))
        return self

    def neq(self, key, val):
        self.filters.append((key, "neq", val))
        return self

    def gte(self, key, val):
        self.filters.append((key, "gte", val))
        return self

    def lte(self, key, val):
        self.filters.append((key, "lte", val))
        return self

    def is_(self, key, val):
        self.filters.append((key, "is", val))
        return self

    def in_(self, key, vals):
        self.filters.append((key, "in", list(vals)))
        return self

    def order(self, key, desc=False, **kwargs):
        self._order_key = key
        self._desc = desc
        return self

    def limit(self, n):
        self._limit = n
        return self

    def insert(self, payload):
        self._pending_insert = payload
        return self

    def update(self, patch):
        self._pending_update = patch
        return self

    def upsert(self, payload, on_conflict=None, **kwargs):
        self._pending_upsert = payload
        if on_conflict:
            self._on_conflict = [c.strip() for c in on_conflict.split(",")]
        return self

    def delete(self):
        self._pending_update = "__delete__"  # marker
        return self

    def _matches(self, row):
        for key, op, val in self.filters:
            cell = row.get(key)
            if op == "eq" and cell != val:
                return False
            if op == "neq" and cell == val:
                return False
            if op == "is" and cell is not (None if val is None else val):
                return False
            if op == "gte" and not (cell is not None and cell >= val):
                return False
            if op == "lte" and not (cell is not None and cell <= val):
                return False
            if op == "in" and cell not in val:
                return False
        return True

    def execute(self):
        rows_store = self.db.setdefault(self.name, [])

        if self._pending_insert is not None:
            payloads = (
                self._pending_insert
                if isinstance(self._pending_insert, list)
                else [self._pending_insert]
            )
            inserted = []
            for p in payloads:
                row = dict(p)
                row.setdefault("id", f"row-{self.name}-{len(rows_store) + 1}")
                rows_store.append(row)
                inserted.append(row)
            return _Exec(inserted)

        if self._pending_upsert is not None:
            payloads = (
                self._pending_upsert
                if isinstance(self._pending_upsert, list)
                else [self._pending_upsert]
            )
            keys = self._on_conflict or ["id"]
            upserted = []
            for p in payloads:
                match = None
                for existing in rows_store:
                    if all(existing.get(k) == p.get(k) for k in keys):
                        match = existing
                        break
                if match is not None:
                    match.update(p)
                    upserted.append(match)
                else:
                    row = dict(p)
                    row.setdefault("id", f"row-{self.name}-{len(rows_store) + 1}")
                    rows_store.append(row)
                    upserted.append(row)
            return _Exec(upserted)

        matching = [r for r in rows_store if self._matches(r)]
        if self._pending_update is not None:
            if self._pending_update == "__delete__":
                self.db[self.name] = [r for r in rows_store if r not in matching]
                return _Exec(matching)
            for r in matching:
                r.update(self._pending_update)
            return _Exec(matching)

        rows = list(matching)
        if self._order_key:
            rows.sort(key=lambda r: r.get(self._order_key) or "", reverse=self._desc)
        if self._limit is not None:
            rows = rows[: self._limit]
        return _Exec(rows)


class _RpcExec:
    def __init__(self, data):
        self.data = data


class _RpcCall:
    def __init__(self, value):
        self._value = value

    def execute(self):
        return _RpcExec(self._value)


class SBStub:
    def __init__(self, db: dict[str, list[dict[str, Any]]] | None = None):
        self.db: dict[str, list[dict[str, Any]]] = db or {}

    def table(self, name: str):
        return _Query(name, self.db)

    def rpc(self, name: str, params: dict[str, Any] | None = None):
        params = params or {}
        # Emulate the atomic counter RPCs by performing the same UPDATE.
        if name == "community_inc_thread_reply_count":
            return _RpcCall(self._inc("community_threads", params.get("p_thread_id"), "reply_count", params.get("p_delta", 0), floor_at_zero=True))
        if name == "community_inc_thread_vote_count":
            return _RpcCall(self._inc("community_threads", params.get("p_thread_id"), "vote_count", params.get("p_delta", 0)))
        if name == "community_inc_reply_vote_count":
            return _RpcCall(self._inc("community_replies", params.get("p_reply_id"), "vote_count", params.get("p_delta", 0)))
        if name == "community_inc_resource_upvote_count":
            return _RpcCall(self._inc("community_resources", params.get("p_resource_id"), "upvote_count", params.get("p_delta", 0), floor_at_zero=True))
        if name == "community_inc_resource_report_count":
            return _RpcCall(self._inc("community_resources", params.get("p_resource_id"), "report_count", params.get("p_delta", 0), floor_at_zero=True))
        return _RpcCall(None)

    def _inc(self, table: str, row_id: Any, col: str, delta: int, floor_at_zero: bool = False) -> int | None:
        for r in self.db.get(table, []):
            if r.get("id") == row_id:
                new_val = (r.get(col) or 0) + (delta or 0)
                if floor_at_zero and new_val < 0:
                    new_val = 0
                r[col] = new_val
                return new_val
        return None
