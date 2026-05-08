from __future__ import annotations


class AppError(Exception):
    """Base class for predictable application-level errors."""


class ValidationError(AppError):
    """Raised for invalid request/input state."""


class DatabaseError(AppError):
    """Raised when a critical database operation fails."""


class PromotionError(AppError):
    """Raised when promotion from queue to canonical records fails."""


class ScraperPipelineError(AppError):
    """Raised when scrape pipeline orchestration fails."""

