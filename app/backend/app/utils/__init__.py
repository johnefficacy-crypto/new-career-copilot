"""Shared utilities for backend Supabase calls.

Created in this PR to host :mod:`app.utils.safe`, the schema-drift
detector that replaces the ad-hoc ``except Exception → return default``
pattern scattered across ``_safe`` helpers throughout the codebase.
"""
