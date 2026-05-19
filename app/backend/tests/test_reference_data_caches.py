"""Reference-data TTL caches.

Three admin-mutable but read-heavy tables (``exams``,
``persona_question_bank``, ``exam_eligibility_rules``) sit behind a
10-minute in-process TTL cache. Dashboard fanout reads each one
repeatedly; without the cache that's wasted Supabase round-trips.

These tests assert:
  * Identical input within the TTL window reads Supabase exactly once.
  * Calling the documented invalidate helper forces a fresh read.
"""
from __future__ import annotations

from app.exam_eligibility import evaluator as eligibility_module
from app.exam_intelligence import lookup as lookup_module
from app.persona_questions import bank as bank_module


class _CountingTable:
    def __init__(self, rows, counter):
        self._rows = rows
        self._counter = counter
        self._chain = []

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def in_(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        self._counter[0] += 1

        class _Exec:
            def __init__(self, data):
                self.data = data
        return _Exec(self._rows)


class _CountingSupabase:
    def __init__(self, table_rows):
        self._table_rows = table_rows
        self.counts: dict[str, list[int]] = {k: [0] for k in table_rows}

    def table(self, name):
        return _CountingTable(self._table_rows[name], self.counts[name])


def test_resolve_exam_by_slug_caches_within_ttl():
    sb = _CountingSupabase({"exams": [{"id": "x1", "slug": "ssc", "name": "SSC"}]})
    lookup_module.invalidate_exam_lookup_cache()
    a = lookup_module.resolve_exam_by_slug(sb, "ssc")
    b = lookup_module.resolve_exam_by_slug(sb, "ssc")
    assert a == b == {"id": "x1", "slug": "ssc", "name": "SSC"}
    assert sb.counts["exams"][0] == 1


def test_resolve_exam_by_id_caches_within_ttl():
    sb = _CountingSupabase({"exams": [{"id": "x1", "slug": "ssc", "name": "SSC"}]})
    lookup_module.invalidate_exam_lookup_cache()
    a = lookup_module.resolve_exam_by_id(sb, "x1")
    b = lookup_module.resolve_exam_by_id(sb, "x1")
    assert a == b == {"id": "x1", "slug": "ssc", "name": "SSC"}
    assert sb.counts["exams"][0] == 1


def test_list_active_exams_caches_within_ttl():
    sb = _CountingSupabase({"exams": [{"id": "x1", "slug": "ssc", "name": "SSC", "is_active": True}]})
    lookup_module.invalidate_exam_lookup_cache()
    lookup_module.list_active_exams(sb, limit=100)
    lookup_module.list_active_exams(sb, limit=100)
    assert sb.counts["exams"][0] == 1


def test_invalidate_exam_lookup_cache_forces_refetch():
    sb = _CountingSupabase({"exams": [{"id": "x1", "slug": "ssc", "name": "SSC"}]})
    lookup_module.invalidate_exam_lookup_cache()
    lookup_module.resolve_exam_by_slug(sb, "ssc")
    lookup_module.invalidate_exam_lookup_cache()
    lookup_module.resolve_exam_by_slug(sb, "ssc")
    assert sb.counts["exams"][0] == 2


def test_persona_question_bank_caches_within_ttl():
    sb = _CountingSupabase({
        "persona_question_bank": [{"question_key": "q1", "is_active": True, "priority": 1}]
    })
    bank_module.invalidate_bank_cache()
    bank_module.list_active_questions(sb)
    bank_module.list_active_questions(sb)
    assert sb.counts["persona_question_bank"][0] == 1


def test_invalidate_bank_cache_forces_refetch():
    sb = _CountingSupabase({
        "persona_question_bank": [{"question_key": "q1", "is_active": True, "priority": 1}]
    })
    bank_module.invalidate_bank_cache()
    bank_module.list_active_questions(sb)
    bank_module.invalidate_bank_cache()
    bank_module.list_active_questions(sb)
    assert sb.counts["persona_question_bank"][0] == 2


def test_load_rules_by_exam_caches_within_ttl():
    sb = _CountingSupabase({
        "exam_eligibility_rules": [
            {"exam_id": "x1", "scope": "all", "rule_type": "age_max",
             "value_num": 32, "value_text": None, "is_knockout": True,
             "source_url": None, "reviewer_status": "verified"}
        ]
    })
    eligibility_module.invalidate_eligibility_rules_cache()
    eligibility_module._load_rules_by_exam(sb, ["x1"])
    eligibility_module._load_rules_by_exam(sb, ["x1"])
    assert sb.counts["exam_eligibility_rules"][0] == 1


def test_invalidate_eligibility_rules_cache_forces_refetch():
    sb = _CountingSupabase({
        "exam_eligibility_rules": [
            {"exam_id": "x1", "scope": "all", "rule_type": "age_max",
             "value_num": 32, "value_text": None, "is_knockout": True,
             "source_url": None, "reviewer_status": "verified"}
        ]
    })
    eligibility_module.invalidate_eligibility_rules_cache()
    eligibility_module._load_rules_by_exam(sb, ["x1"])
    eligibility_module.invalidate_eligibility_rules_cache()
    eligibility_module._load_rules_by_exam(sb, ["x1"])
    assert sb.counts["exam_eligibility_rules"][0] == 2


def test_load_rules_by_exam_distinct_exam_sets_share_no_cache():
    sb = _CountingSupabase({
        "exam_eligibility_rules": [
            {"exam_id": "x1", "scope": "all", "rule_type": "age_max",
             "value_num": 32, "value_text": None, "is_knockout": True,
             "source_url": None, "reviewer_status": "verified"}
        ]
    })
    eligibility_module.invalidate_eligibility_rules_cache()
    eligibility_module._load_rules_by_exam(sb, ["x1"])
    eligibility_module._load_rules_by_exam(sb, ["x2"])
    assert sb.counts["exam_eligibility_rules"][0] == 2
