from __future__ import annotations

import asyncio
import logging
from typing import Any

from supabase import Client

from app.core.error_utils import log_warning_with_context
from app.core.errors import DatabaseError

logger = logging.getLogger("career_copilot.db")


def safe_select(supabase: Client, table: str, columns: str, **filters: Any) -> list[dict[str, Any]]:
    """Execute a select query and return rows, or [] if the query fails."""
    try:
        q = supabase.table(table).select(columns)
        for key, value in filters.items():
            q = q.eq(key, value)
        return q.execute().data or []
    except Exception as exc:  # noqa: BLE001
        log_warning_with_context(logger, "supabase.select", exc, table=table, filters=filters)
        return []


async def async_safe_select(
    supabase: Client, table: str, columns: str, **filters: Any
) -> list[dict[str, Any]]:
    """Async wrapper around safe_select for async API boundaries.

    supabase-py calls are sync in this codebase today; run them in a worker
    thread so async endpoints can avoid blocking the event loop directly.
    """
    return await asyncio.to_thread(safe_select, supabase, table, columns, **filters)


def require_select(supabase: Client, table: str, columns: str, **filters: Any) -> list[dict[str, Any]]:
    """Execute a select query and raise DatabaseError on failures.

    Use for critical reads that should not silently degrade.
    """
    try:
        q = supabase.table(table).select(columns)
        for key, value in filters.items():
            q = q.eq(key, value)
        return q.execute().data or []
    except Exception as exc:  # noqa: BLE001
        log_warning_with_context(logger, "supabase.select_required", exc, table=table, filters=filters)
        raise DatabaseError(f"Failed required select on {table}") from exc


def execute_or_raise(operation: str, call):
    """Execute a DB operation and raise DatabaseError on failure."""
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        log_warning_with_context(logger, "supabase.execute_or_raise", exc, db_operation=operation)
        raise DatabaseError(f"Database operation failed: {operation}") from exc


def execute_or_default(operation: str, call, default):
    """Execute a DB operation and return default when failure is safe."""
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        log_warning_with_context(logger, "supabase.execute_or_default", exc, db_operation=operation)
        return default
