"""Tests for the filter-aware Supabase stub itself (Task 1)."""
from __future__ import annotations

import pytest

from tests.helpers.supabase_stub import FullScanError, SupabaseStub


def _seed():
    return {
        "t": [
            {"id": "a", "status": "open", "name": "A"},
            {"id": "b", "status": "open", "name": "B"},
            {"id": "c", "status": "rejected", "name": "C"},
            {"id": "d", "status": "duplicate", "name": "D"},
            {"id": "e", "status": "pending", "name": "E"},
        ]
    }


def test_eq_filters():
    sb = SupabaseStub(_seed())
    rows = sb.table("t").select("*").eq("status", "open").execute().data
    assert {r["id"] for r in rows} == {"a", "b"}


def test_in_filters():
    sb = SupabaseStub(_seed())
    rows = sb.table("t").select("*").in_("id", ["a", "c"]).execute().data
    assert {r["id"] for r in rows} == {"a", "c"}


def test_not_in_filters():
    sb = SupabaseStub(_seed())
    rows = sb.table("t").select("*").not_.in_("status", ["rejected", "duplicate"]).execute().data
    assert {r["id"] for r in rows} == {"a", "b", "e"}


def test_limit_after_filter():
    sb = SupabaseStub(_seed())
    rows = sb.table("t").select("*").eq("status", "open").limit(1).execute().data
    assert len(rows) == 1


def test_select_projection():
    sb = SupabaseStub(_seed())
    rows = sb.table("t").select("id, name").eq("id", "a").execute().data
    assert rows == [{"id": "a", "name": "A"}]


def test_or_filter_recorded_not_applied():
    sb = SupabaseStub(_seed())
    sb.table("t").select("id").or_("x.eq.1,y.eq.2").limit(20).execute()
    rec = sb.calls_for("t")[-1]
    assert rec.or_filter == "x.eq.1,y.eq.2"
    assert rec.limit == 20


def test_json_path_eq():
    sb = SupabaseStub({"q": [
        {"id": "1", "extracted_data": {"notification_number": "12/2024"}},
        {"id": "2", "extracted_data": {"notification_number": "99/2024"}},
    ]})
    rows = sb.table("q").select("id").eq("extracted_data->>notification_number", "12/2024").execute().data
    assert [r["id"] for r in rows] == ["1"]


def test_no_full_scan_guard_raises_on_unfiltered_execute():
    sb = SupabaseStub(_seed())
    sb.guard_no_full_scan("t")
    with pytest.raises(FullScanError):
        sb.table("t").select("*").execute()


def test_no_full_scan_guard_allows_filtered_execute():
    sb = SupabaseStub(_seed())
    sb.guard_no_full_scan("t")
    # any filter satisfies the guard
    rows = sb.table("t").select("*").eq("status", "open").execute().data
    assert rows
    # an .or_ also satisfies it
    sb.table("t").select("id").or_("status.eq.open").execute()


def test_calls_are_recorded():
    sb = SupabaseStub(_seed())
    sb.table("t").select("id").eq("status", "open").limit(5).execute()
    rec = sb.calls_for("t")[-1]
    assert rec.select == "id"
    assert ("eq", "status", "open") in rec.filters
    assert rec.limit == 5
