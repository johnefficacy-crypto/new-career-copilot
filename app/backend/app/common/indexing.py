from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from typing import Any


def index_by(rows: Iterable[dict[str, Any]], key: str) -> dict[Any, dict[str, Any]]:
    return {row[key]: row for row in rows if row.get(key) is not None}


def group_by(rows: Iterable[dict[str, Any]], key: str) -> dict[Any, list[dict[str, Any]]]:
    grouped: dict[Any, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[row.get(key)].append(row)
    return dict(grouped)


def normalize_token(value: str | None) -> str:
    return (value or "").strip().lower().replace("-", "_").replace(" ", "_")
