from __future__ import annotations

import logging
from typing import Any


def format_error_context(operation: str, **context: Any) -> str:
    """Build a compact operation/context string for logs."""
    if not context:
        return operation
    parts = ", ".join(f"{key}={value!r}" for key, value in sorted(context.items()))
    return f"{operation} [{parts}]"


def log_warning_with_context(
    logger: logging.Logger, operation: str, exc: Exception, **context: Any
) -> None:
    """Emit a consistent warning log for recoverable pipeline failures."""
    logger.warning("%s failed: %s", format_error_context(operation, **context), exc)

