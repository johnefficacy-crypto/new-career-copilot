"""Filter-aware in-memory Supabase stub for dedup tests.

The legacy scraper stubs returned the same canned rows regardless of
``.eq()`` / ``.in_()`` / ``.limit()``, so a test could not prove a query
was actually *targeted*. This stub RECORDS every call and APPLIES the
filters it can, so dedup tests can assert both the query shape (it was
keyed, bounded) and the result (correct rows came back).

Supported / applied:
  .select(cols)            → projects to those columns on the result
  .eq(col, val)            → row[col] == val   (supports ``a->>b`` JSON path)
  .in_(col, vals)          → row[col] in vals
  .not_.in_(col, vals)     → row[col] not in vals
  .limit(n)                → slice
  .order(col, desc=)       → sort
  .range(start, end)       → inclusive slice
  .single()/.maybe_single()→ first row / None

Recorded only (not applied): .or_(filter_string) — tests assert it was set.

No-full-scan guard: register a table name via ``stub.guard_no_full_scan``;
calling ``.execute()`` on that table with NO applied filter raises
``FullScanError`` so a regression that drops the dedup key fails loud.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


class FullScanError(AssertionError):
    """Raised when a guarded table is queried without any filter."""


@dataclass
class CallRecord:
    table: str
    select: str | None = None
    filters: list[tuple] = field(default_factory=list)  # (op, col, val)
    or_filter: str | None = None
    limit: int | None = None
    order: tuple | None = None
    range: tuple | None = None


def _json_path_get(row: dict, col: str) -> Any:
    """Resolve ``extracted_data->>notification_number`` style accessors."""
    m = re.match(r"^(\w+)->>(\w+)$", col)
    if m:
        outer, inner = m.group(1), m.group(2)
        d = row.get(outer)
        if isinstance(d, dict):
            v = d.get(inner)
            return None if v is None else str(v)
        return None
    return row.get(col)


class _Query:
    def __init__(self, parent: "SupabaseStub", table: str):
        self._parent = parent
        self._rec = CallRecord(table=table)
        self._not = False  # set by the `.not_` accessor for the next .in_

    # ── filter / projection builders ──────────────────────────────────
    def select(self, columns: str = "*", **_kw):
        self._rec.select = columns
        return self

    def eq(self, col, val):
        self._rec.filters.append(("eq", col, val))
        return self

    def in_(self, col, vals):
        op = "not_in" if self._not else "in"
        self._not = False
        self._rec.filters.append((op, col, list(vals)))
        return self

    @property
    def not_(self):
        self._not = True
        return self

    def or_(self, filter_string: str):
        self._rec.or_filter = filter_string
        return self

    def limit(self, n):
        self._rec.limit = n
        return self

    def order(self, col, desc: bool = False, **_kw):
        self._rec.order = (col, desc)
        return self

    def range(self, start, end):
        self._rec.range = (start, end)
        return self

    def insert(self, payload):
        self._rec.filters.append(("insert", None, payload))
        return self

    def update(self, payload):
        self._rec.filters.append(("update", None, payload))
        return self

    # ── execution ─────────────────────────────────────────────────────
    def _applied_filter_count(self) -> int:
        return sum(1 for op, _, _ in self._rec.filters if op in ("eq", "in", "not_in")) + (
            1 if self._rec.or_filter else 0
        )

    def _matching_rows(self) -> list[dict]:
        rows = [dict(r) for r in self._parent.db.get(self._rec.table, [])]
        for op, col, val in self._rec.filters:
            if op == "eq":
                rows = [r for r in rows if _json_path_get(r, col) == val]
            elif op == "in":
                rows = [r for r in rows if _json_path_get(r, col) in val]
            elif op == "not_in":
                rows = [r for r in rows if _json_path_get(r, col) not in val]
        if self._rec.order:
            ocol, desc = self._rec.order
            rows.sort(key=lambda r: (r.get(ocol) is None, r.get(ocol)), reverse=desc)
        if self._rec.range:
            s, e = self._rec.range
            rows = rows[s : e + 1]
        if self._rec.limit is not None:
            rows = rows[: self._rec.limit]
        if self._rec.select and self._rec.select != "*":
            cols = [c.strip() for c in self._rec.select.split(",")]
            # keep simple top-level columns; embedded selects like
            # "organizations(name)" are passed through untouched.
            simple = [c for c in cols if "(" not in c and "->>" not in c]
            if simple:
                projected = []
                for r in rows:
                    keep = {k: v for k, v in r.items() if k in simple or k in r and any(
                        c == k for c in cols
                    )}
                    # Always keep embedded keys (e.g. "organizations") verbatim.
                    for c in cols:
                        base = c.split("(")[0].strip()
                        if base in r:
                            keep[base] = r[base]
                    projected.append(keep or r)
                rows = projected
        return rows

    def _record_and_guard(self):
        self._parent.calls.append(self._rec)
        is_write = any(op in ("insert", "update") for op, _, _ in self._rec.filters)
        if (
            not is_write
            and self._rec.table in self._parent._guarded_tables
            and self._applied_filter_count() == 0
        ):
            raise FullScanError(
                f"unfiltered .execute() on guarded table {self._rec.table!r} "
                f"(select={self._rec.select!r}) — dedup must key on a filter"
            )

    def execute(self):
        self._record_and_guard()
        # writes
        for op, _, payload in self._rec.filters:
            if op == "insert":
                items = payload if isinstance(payload, list) else [payload]
                store = self._parent.db.setdefault(self._rec.table, [])
                inserted = []
                for p in items:
                    row = dict(p)
                    row.setdefault("id", f"row-{self._rec.table}-{len(store)+1}")
                    store.append(row)
                    inserted.append(row)
                return _Result(inserted)
            if op == "update":
                matched = self._matching_rows()
                for r in matched:
                    for live in self._parent.db.get(self._rec.table, []):
                        if live.get("id") == r.get("id"):
                            live.update(payload)
                return _Result(matched)
        return _Result(self._matching_rows())

    def single(self):
        rows = self._matching_rows()
        self._record_and_guard()
        return _Result(rows[0] if rows else None)

    def maybe_single(self):
        return self.single()


class _Result:
    def __init__(self, data):
        self.data = data
        self.count = len(data) if isinstance(data, list) else (1 if data else 0)


class SupabaseStub:
    def __init__(self, db: dict[str, list[dict]] | None = None):
        self.db: dict[str, list[dict]] = db or {}
        self.calls: list[CallRecord] = []
        self._guarded_tables: set[str] = set()

    def guard_no_full_scan(self, *tables: str) -> None:
        self._guarded_tables.update(tables)

    def table(self, name: str) -> _Query:
        return _Query(self, name)

    # convenience for assertions
    def calls_for(self, table: str) -> list[CallRecord]:
        return [c for c in self.calls if c.table == table]
