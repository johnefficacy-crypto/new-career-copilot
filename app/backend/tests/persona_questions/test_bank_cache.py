"""Cache hit/miss tests for the persona-question-bank TTL cache."""
from __future__ import annotations

from app.persona_questions import bank
from app.persona_questions.bank import (
    invalidate_bank_cache,
    list_active_questions,
)


class _Counter:
    """Minimal Supabase stub that counts executes against the bank table."""

    def __init__(self, rows):
        self.rows = rows
        self.executes = 0

    def table(self, _name):
        return self

    def select(self, *_a, **_kw):
        return self

    def eq(self, *_a, **_kw):
        return self

    def order(self, *_a, **_kw):
        return self

    def limit(self, *_a, **_kw):
        return self

    def execute(self):
        self.executes += 1

        class _R:
            data = self.rows

        return _R()


def test_first_call_hits_supabase_subsequent_calls_serve_from_cache():
    invalidate_bank_cache()
    sb = _Counter([{"id": "q1", "question_key": "intent", "is_active": True}])
    list_active_questions(sb)
    list_active_questions(sb)
    list_active_questions(sb)
    assert sb.executes == 1


def test_invalidate_forces_refresh():
    invalidate_bank_cache()
    sb = _Counter([{"id": "q1", "question_key": "intent", "is_active": True}])
    list_active_questions(sb)
    invalidate_bank_cache()
    list_active_questions(sb)
    assert sb.executes == 2


def test_returned_list_is_independent_copy_not_shared_mutable_state():
    # Callers occasionally mutate the list (e.g. sort or filter in place).
    # We must not let those edits leak back into the cache.
    invalidate_bank_cache()
    sb = _Counter([{"id": "q1"}, {"id": "q2"}])
    first = list_active_questions(sb)
    first.clear()
    second = list_active_questions(sb)
    assert len(second) == 2
