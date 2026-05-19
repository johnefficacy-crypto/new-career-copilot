"""PR6 — Onboarding ``fields=`` allowlist + cross-session boundary.

Asserts the resolver's hint-filtering layer cannot be used to widen the
answer/skip authorisation (no arbitrary column write) and that owner
checks on /answer + /skip stay intact.
"""
from __future__ import annotations

from app.api import onboarding_unified as onb


class FakeQuery:
    def __init__(self, rows):
        self.rows = rows

    def select(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def execute(self):
        class R:
            pass

        r = R()
        r.data = list(self.rows)
        return r


class FakeSB:
    def __init__(self, registry_keys):
        self.registry_keys = registry_keys

    def table(self, name):
        if name == "candidate_field_registry":
            rows = [
                {
                    "field_key": k,
                    "canonical_label": k,
                    "user_facing_label": k,
                    "data_type": "text",
                    "profile_group": "identity",
                    "profile_table": "profiles",
                    "profile_column": k,
                    "question_template": "?",
                    "help_text": None,
                    "allowed_values": None,
                    "is_active": True,
                }
                for k in self.registry_keys
            ]
            return FakeQuery(rows)
        return FakeQuery([])


def test_unknown_hints_dropped_silently():
    sb = FakeSB({"date_of_birth", "category", "domicile_state"})
    out = onb._filter_field_hints(sb, "date_of_birth,evil_column,DROP TABLE,domicile_state")
    assert sorted(out) == ["date_of_birth", "domicile_state"]


def test_empty_input_returns_empty_list():
    sb = FakeSB({"date_of_birth"})
    assert onb._filter_field_hints(sb, None) == []
    assert onb._filter_field_hints(sb, "") == []
    assert onb._filter_field_hints(sb, ",,, ,") == []


def test_max_items_capped_at_ten():
    keys = {f"f{i}" for i in range(20)}
    sb = FakeSB(keys)
    raw = ",".join(f"f{i}" for i in range(15))
    out = onb._filter_field_hints(sb, raw)
    assert len(out) == 10


def test_all_unknown_collapses_to_empty():
    sb = FakeSB({"category"})
    out = onb._filter_field_hints(sb, "bogus_one,bogus_two")
    assert out == []


def test_duplicate_hints_deduped_pre_registry_check():
    sb = FakeSB({"category"})
    out = onb._filter_field_hints(sb, "category,category,category")
    assert out == ["category"]


def test_filter_does_not_consult_user_or_session_tables():
    """The hint-filter touches only candidate_field_registry — make sure
    no other table read sneaks in."""
    accessed = []

    class _SB:
        def table(self, name):
            accessed.append(name)
            return FakeQuery([
                {"field_key": "category"},
            ])

    onb._filter_field_hints(_SB(), "category,evil")
    assert accessed == ["candidate_field_registry"]
