from __future__ import annotations

import logging
from typing import Any

from supabase import Client

logger = logging.getLogger("career_copilot.db")


def safe_select(supabase: Client, table: str, columns: str, **filters: Any) -> list[dict[str, Any]]:
    """Execute a select query and return rows, or [] if the query fails."""
    try:
        q = supabase.table(table).select(columns)
        for key, value in filters.items():
            q = q.eq(key, value)
        return q.execute().data or []
    except Exception as exc:  # noqa: BLE001
        logger.warning("supabase select %s failed: %s", table, exc)
        return []

