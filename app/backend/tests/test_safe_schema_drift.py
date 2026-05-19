"""Tests for app.utils.safe — schema-drift aware Supabase wrapper.

The bug this guards against: ``GET /api/metadata/certifications`` was
returning 200 with ``{items: []}`` while Supabase rejected the select
with ``42703 column "aliases" does not exist``. Schema drift was being
silently swallowed by the local ``_safe`` ``except Exception → default``
pattern, shipping wrong data to the UI.
"""
from __future__ import annotations

import logging

import pytest

from app.utils.safe import (
    SchemaDriftError,
    detect_schema_drift,
    safe_call,
)


# ── detect_schema_drift classification ─────────────────────────────────


def test_detects_pg_column_missing_42703():
    exc = RuntimeError(
        '{"code":"42703","message":"column certifications.aliases does not exist"}'
    )
    drift, code, missing = detect_schema_drift(exc)
    assert drift is True
    assert code == "column_missing"
    # Fully-qualified table.column form preserves the table name so an
    # operator can locate the migration gap precisely from the log line.
    assert missing == "certifications.aliases"


def test_detects_postgrest_column_not_found_pgrst204():
    exc = RuntimeError("PGRST204: Could not find the column 'aliases' in the schema cache")
    drift, code, missing = detect_schema_drift(exc)
    assert drift is True
    assert code == "column_not_found"
    assert missing == "aliases"


def test_detects_rpc_missing_pgrst202():
    exc = RuntimeError(
        "PGRST202: Could not find the function public.enqueue_eligibility_recompute"
    )
    drift, code, missing = detect_schema_drift(exc)
    assert drift is True
    assert code == "rpc_missing"
    assert missing == "public.enqueue_eligibility_recompute"


def test_detects_relation_missing_42p01():
    exc = RuntimeError(
        '{"code":"42P01","message":"relation \\"foo\\" does not exist"}'
    )
    drift, code, missing = detect_schema_drift(exc)
    assert drift is True
    assert code == "relation_missing"
    assert missing == "foo"


def test_detects_does_not_exist_fallback_without_code():
    exc = RuntimeError("function public.do_thing does not exist")
    drift, code, missing = detect_schema_drift(exc)
    assert drift is True
    assert code == "schema_drift"
    assert missing == "public.do_thing"


def test_ignores_unrelated_errors():
    exc = ConnectionError("Server disconnected without sending a response")
    drift, code, missing = detect_schema_drift(exc)
    assert drift is False
    assert code is None
    assert missing is None


# ── safe_call behaviour ────────────────────────────────────────────────


def test_safe_call_returns_value_on_success():
    assert safe_call(lambda: "ok", default=None) == "ok"


def test_safe_call_returns_default_on_transient_error(caplog):
    caplog.set_level(logging.WARNING, logger="career_copilot.utils.safe")

    def boom():
        raise ConnectionError("Server disconnected")

    assert safe_call(boom, default=[]) == []
    assert any("supabase call failed" in r.getMessage() for r in caplog.records)


def test_safe_call_raises_on_schema_drift_by_default():
    def boom():
        raise RuntimeError(
            '{"code":"42703","message":"column certifications.aliases does not exist"}'
        )

    with pytest.raises(SchemaDriftError) as ei:
        safe_call(boom, default=[])
    assert ei.value.code == "column_missing"
    assert ei.value.missing == "certifications.aliases"


def test_safe_call_returns_default_when_drift_suppressed(caplog):
    caplog.set_level(logging.WARNING, logger="career_copilot.utils.safe")

    def boom():
        raise RuntimeError(
            '{"code":"42703","message":"column foo.bar does not exist"}'
        )

    out = safe_call(boom, default=[], raise_on_schema_error=False)
    assert out == []
    # The WARNING must surface the column name so an operator can
    # spot the gap. This is the contract that lets read-and-return
    # endpoints still emit a default without losing observability.
    messages = [r.getMessage() for r in caplog.records]
    assert any("missing=foo.bar" in m for m in messages)
    assert any("code=column_missing" in m for m in messages)


def test_safe_call_does_not_double_wrap_schema_drift():
    def boom():
        raise SchemaDriftError("already classified", code="column_missing", missing="x")

    with pytest.raises(SchemaDriftError) as ei:
        safe_call(boom, default=[])
    assert ei.value.code == "column_missing"
    assert ei.value.missing == "x"
