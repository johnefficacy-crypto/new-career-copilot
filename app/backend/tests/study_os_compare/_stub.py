"""Re-export the shared in-memory Supabase stub for compare tests, with
small extensions (`.lt()`, `.or_()`, count="exact") needed by the
study-OS comparison modules.
"""
from typing import Any

from tests.persona_questions._stub import SBStub, _Exec, _Query  # noqa: F401


def _lt(self, key, val):
    self.filters.append((key, "lt", val))
    return self


def _or_(self, expr):
    self._or_expr = expr
    return self


_orig_matches = _Query._matches


def _matches(self, row):
    if not _orig_matches(self, row):
        return False
    expr = getattr(self, "_or_expr", None)
    if not expr:
        return True
    for clause in expr.split(","):
        if "." in clause:
            key, _, rest = clause.partition(".")
            op, _, val = rest.partition(".")
            cell = row.get(key)
            if op == "eq" and cell == val:
                return True
    return False


_orig_filter_check = _Query._matches.__wrapped__ if hasattr(_Query._matches, "__wrapped__") else _orig_matches


def _matches_with_lt(self, row):
    if not _orig_matches(self, row):
        return False
    for k, op, val in self.filters:
        if op == "lt":
            cell = row.get(k)
            if cell is None or not (cell < val):
                return False
    expr = getattr(self, "_or_expr", None)
    if expr:
        for clause in expr.split(","):
            if "." in clause:
                key, _, rest = clause.partition(".")
                op, _, val = rest.partition(".")
                cell = row.get(key)
                if op == "eq" and cell == val:
                    return True
        return False
    return True


_Query.lt = _lt
_Query.or_ = _or_
_Query._matches = _matches_with_lt
