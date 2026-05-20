"""Targeted dedup: query-shape + correctness (Tasks 3/4/6).

Uses the filter-aware stub so we can assert BOTH that the queries were
keyed/bounded (no full scan) AND that the right rows came back.
"""
from __future__ import annotations

from app.scraping import dedup as D
from tests.helpers.supabase_stub import SupabaseStub


# canonical_key for "ssc cgl"/"SSC CGL" org, year 2024, title "Combined ...":
# recruitment_key normalises org+title; we build fixtures whose stored
# fields reproduce the candidate's sim_key exactly.
def _rec(id_, *, org, year, name, notif=None, notif_url=None, apply_url=None):
    return {
        "id": id_,
        "name": name,
        "year": year,
        "organizations": {"name": org},
        "official_notification_url": notif_url,
        "official_apply_url": apply_url,
        "notification_number": notif,
    }


def _sim_key(org, year, title):
    from app.scraping.extractor import recruitment_key
    return recruitment_key(org, year, title)


# ── Query SHAPE tests ──────────────────────────────────────────────────


def test_pre_llm_uses_or_on_both_url_columns_and_limit_20():
    sb = SupabaseStub({"recruitments": []})
    sb.guard_no_full_scan("recruitments", "scrape_queue")
    D.pre_llm_dedup_check(sb, "https://x.gov.in/notice.pdf")
    rec = sb.calls_for("recruitments")[-1]
    assert rec.or_filter == (
        "official_notification_url.eq.https://x.gov.in/notice.pdf,"
        "official_apply_url.eq.https://x.gov.in/notice.pdf"
    )
    assert rec.limit == 20


def test_path_a_queries_notification_number_with_limit_10():
    sb = SupabaseStub({"recruitments": []})
    sb.guard_no_full_scan("recruitments", "scrape_queue")
    D.post_extraction_dedup_recruitments(
        sb, {"notification_number": "12/2024", "year": 2024, "organization_name": "SSC", "title": "X"},
        _sim_key("SSC", 2024, "X"),
    )
    rec = sb.calls_for("recruitments")[-1]
    assert ("eq", "notification_number", "12/2024") in rec.filters
    assert rec.limit == 10


def test_path_c_queries_org_id_and_year():
    sb = SupabaseStub({
        "organizations": [{"id": "org-1", "name": "Staff Selection Commission"}],
        "recruitments": [],
    })
    sb.guard_no_full_scan("recruitments", "scrape_queue")
    D.post_extraction_dedup_recruitments(
        sb,
        {"notification_number": None, "year": 2024, "organization_name": "Staff Selection Commission", "title": "X"},
        _sim_key("Staff Selection Commission", 2024, "X"),
    )
    rec = sb.calls_for("recruitments")[-1]
    assert ("eq", "organization_id", "org-1") in rec.filters
    assert ("eq", "year", 2024) in rec.filters
    assert rec.limit == 20


def test_path_d_e_fire_zero_recruitment_queries():
    sb = SupabaseStub({"recruitments": [], "organizations": []})
    sb.guard_no_full_scan("recruitments", "scrape_queue")
    # no notif, no org+year → needs_review, no query
    res = D.post_extraction_dedup_recruitments(
        sb, {"notification_number": None, "year": None, "organization_name": None, "title": "X"},
        _sim_key("", None, "X"),
    )
    assert res.status == "needs_review"
    assert sb.calls_for("recruitments") == []


# ── CORRECTNESS scenarios (from the brief) ─────────────────────────────


def _fixture_three():
    """3 recruitments; one matches notif 12/2024 + canonical 'ssc-2024-combined'."""
    return {
        "recruitments": [
            _rec("rec-match", org="SSC", year=2024, name="Combined", notif="12/2024"),
            _rec("rec-other1", org="UPSC", year=2023, name="Civil", notif="99/2023"),
            _rec("rec-other2", org="RRB", year=2024, name="NTPC", notif="55/2024"),
        ],
        "organizations": [{"id": "org-ssc", "name": "SSC"}],
    }


def test_scenario_1_notif_and_key_match_is_duplicate():
    sb = SupabaseStub(_fixture_three())
    sim = _sim_key("SSC", 2024, "Combined")
    res = D.post_extraction_dedup_recruitments(
        sb, {"notification_number": "12/2024", "year": 2024, "organization_name": "SSC", "title": "Combined"}, sim
    )
    assert res.status == "duplicate"
    assert res.duplicate_of == "rec-match"


def test_scenario_2_notif_match_key_mismatch_is_needs_review():
    sb = SupabaseStub(_fixture_three())
    # same notif, different canonical key (title differs)
    sim = _sim_key("SSC", 2024, "TotallyDifferentTitle")
    res = D.post_extraction_dedup_recruitments(
        sb, {"notification_number": "12/2024", "year": 2024, "organization_name": "SSC", "title": "TotallyDifferentTitle"}, sim
    )
    assert res.status == "needs_review", res
    assert "rec-match" in res.candidate_ids


def test_scenario_3_org_year_match_but_key_mismatch_is_unique():
    # two recruitments share org+year, neither matches the candidate's key
    sb = SupabaseStub({
        "recruitments": [
            _rec("r1", org="SSC", year=2024, name="Alpha"),
            _rec("r2", org="SSC", year=2024, name="Beta"),
        ],
        "organizations": [{"id": "org-ssc", "name": "SSC"}],
    })
    sim = _sim_key("SSC", 2024, "Gamma")  # decisive: no key match
    res = D.post_extraction_dedup_recruitments(
        sb, {"notification_number": None, "year": 2024, "organization_name": "SSC", "title": "Gamma"}, sim
    )
    assert res.status == "unique", res


def test_scenario_4_missing_all_keys_needs_review_zero_queries():
    sb = SupabaseStub({"recruitments": [], "organizations": []})
    res = D.post_extraction_dedup_recruitments(
        sb, {"notification_number": None, "year": None, "organization_name": None, "title": ""},
        _sim_key("", None, ""),
    )
    assert res.status == "needs_review"
    assert sb.calls_for("recruitments") == []


def test_scenario_5_two_path_a_matches_needs_review_with_candidates():
    sb = SupabaseStub({
        "recruitments": [
            _rec("dup-1", org="SSC", year=2024, name="Combined", notif="12/2024"),
            _rec("dup-2", org="SSC", year=2024, name="Combined", notif="12/2024"),
        ],
        "organizations": [{"id": "org-ssc", "name": "SSC"}],
    })
    sim = _sim_key("SSC", 2024, "Combined")
    res = D.post_extraction_dedup_recruitments(
        sb, {"notification_number": "12/2024", "year": 2024, "organization_name": "SSC", "title": "Combined"}, sim
    )
    assert res.status == "needs_review"
    assert set(res.candidate_ids) == {"dup-1", "dup-2"}


# ── queue dedup ────────────────────────────────────────────────────────


def test_queue_dedup_prefilter_drops_extracted_data_then_refetches():
    sb = SupabaseStub({
        "scrape_queue": [
            {"id": "q1", "status": "pending", "extracted_data": {
                "organization_name": "SSC", "year": 2024, "title": "Combined", "notification_number": "12/2024"}},
        ],
    })
    sb.guard_no_full_scan("recruitments", "scrape_queue")
    sim = _sim_key("SSC", 2024, "Combined")
    res = D.post_extraction_dedup_queue(
        sb, {"notification_number": "12/2024", "year": 2024, "organization_name": "SSC", "title": "Combined"}, sim
    )
    assert res.status == "duplicate"
    assert res.duplicate_of == "q1"
    queue_calls = sb.calls_for("scrape_queue")
    # stage 1: select id,status (no extracted_data); stage 2: by id with extracted_data
    stage1 = queue_calls[0]
    assert stage1.select == "id, status"
    assert ("not_in", "status", ["rejected", "duplicate", "dry_run"]) in stage1.filters
    assert any(c.select == "id, extracted_data" for c in queue_calls)


def test_queue_dedup_never_filters_by_source_id():
    sb = SupabaseStub({"scrape_queue": []})
    D.post_extraction_dedup_queue(
        sb, {"notification_number": "12/2024", "year": 2024, "organization_name": "SSC", "title": "X"},
        _sim_key("SSC", 2024, "X"),
    )
    for c in sb.calls_for("scrape_queue"):
        assert not any(f[1] == "source_id" for f in c.filters)


# ── pre-LLM correctness ────────────────────────────────────────────────


def test_pre_llm_matches_on_normalized_url():
    sb = SupabaseStub({
        "recruitments": [
            _rec("rec-url", org="SSC", year=2024, name="X",
                 notif_url="http://WWW.x.gov.in/notice/"),  # stored un-normalized
        ],
    })
    # candidate target differs only by scheme/case/trailing slash
    res = D.pre_llm_dedup_check(sb, "https://x.gov.in/notice")
    assert res.status == "duplicate"
    assert res.duplicate_of == "rec-url"
