"""Tests for the unified onboarding profile adapter.

Covers the recruitment allowlist (PR-B):
  * canonical writes for allowlisted field_keys (date_of_birth, domicile_state)
  * sensitive and non-allowlisted keys are blocked
  * idempotency on repeat answers
  * existing canonical values are preserved
  * provenance is recorded under profiles.metadata
  * stitch of anonymous answers triggers eligibility recompute when canonical
    writes occur
"""
from __future__ import annotations

from app.onboarding_unified.profile_adapter import apply_profile_mapping
from app.onboarding_unified import anonymous_stitching as stitch_module
from app.onboarding_unified.anonymous_stitching import stitch_anonymous_sessions
from tests.onboarding_unified._seed import SBStub, field_registry


def _registry():
    return {row["field_key"]: row for row in field_registry()}


def _seed_user(user_id: str = "u-1") -> SBStub:
    return SBStub(
        {
            "profiles": [
                {
                    "id": user_id,
                    "date_of_birth": None,
                    "domicile_state": None,
                    "metadata": {},
                }
            ],
            "aspirant_location": [],
            "candidate_field_registry": field_registry(),
        }
    )


# ── Allowlist writes ─────────────────────────────────────────────────────


def test_writes_allowlisted_date_of_birth_to_profiles():
    sb = _seed_user()
    out = apply_profile_mapping(
        sb,
        "u-1",
        question_source="recruitment_question_requirements",
        question={"field_key": "date_of_birth"},
        normalized_value="1998-04-05",
        registry=_registry(),
        session_id="sess-1",
    )
    assert out["applied"] is True
    assert sb.db["profiles"][0]["date_of_birth"] == "1998-04-05"


def test_domicile_state_mirrors_to_profiles_and_aspirant_location():
    sb = _seed_user()
    out = apply_profile_mapping(
        sb,
        "u-1",
        question_source="recruitment_question_requirements",
        question={"field_key": "domicile_state"},
        normalized_value="Maharashtra",
        registry=_registry(),
        session_id="sess-1",
    )
    assert out["applied"] is True
    assert sb.db["profiles"][0]["domicile_state"] == "Maharashtra"
    # New row inserted in aspirant_location with the user_id PK.
    assert sb.db["aspirant_location"][0]["state"] == "Maharashtra"
    assert sb.db["aspirant_location"][0]["user_id"] == "u-1"


# ── Block lists ──────────────────────────────────────────────────────────


def test_blocks_non_allowlisted_recruitment_answer():
    sb = _seed_user()
    out = apply_profile_mapping(
        sb,
        "u-1",
        question_source="recruitment_question_requirements",
        question={"field_key": "has_marathi_knowledge"},
        normalized_value=True,
        registry=_registry(),
    )
    assert out["applied"] is False
    assert out["reason"] == "not_in_allowlist"


def test_blocks_sensitive_recruitment_answer():
    sb = _seed_user()
    registry = _registry()
    registry["reservation_category"] = {
        "field_key": "reservation_category",
        "profile_group": "reservation",
        "canonical_label": "Reservation category",
    }
    out = apply_profile_mapping(
        sb,
        "u-1",
        question_source="recruitment_question_requirements",
        question={"field_key": "reservation_category"},
        normalized_value="obc",
        registry=registry,
    )
    assert out["applied"] is False
    assert out["reason"] == "sensitive_field_not_written"


def test_anonymous_callers_never_write_canonical():
    sb = _seed_user()
    out = apply_profile_mapping(
        sb,
        None,
        question_source="recruitment_question_requirements",
        question={"field_key": "date_of_birth"},
        normalized_value="1998-04-05",
        registry=_registry(),
    )
    assert out["applied"] is False
    assert out["reason"] == "anonymous_no_canonical_write"
    assert sb.db["profiles"][0]["date_of_birth"] is None


# ── Idempotency + non-overwrite ──────────────────────────────────────────


def test_idempotent_on_repeat_answer_with_same_value():
    sb = _seed_user()
    q = {"field_key": "date_of_birth"}
    apply_profile_mapping(
        sb,
        "u-1",
        question_source="recruitment_question_requirements",
        question=q,
        normalized_value="1998-04-05",
        registry=_registry(),
    )
    # Re-applying the same answer must not corrupt or duplicate.
    out = apply_profile_mapping(
        sb,
        "u-1",
        question_source="recruitment_question_requirements",
        question=q,
        normalized_value="1998-04-05",
        registry=_registry(),
    )
    # No-op because the value is already present.
    assert out["applied"] is False
    assert out["writes"][0]["reason"] == "value_already_present"
    assert sb.db["profiles"][0]["date_of_birth"] == "1998-04-05"
    assert len(sb.db["profiles"]) == 1


def test_existing_non_empty_canonical_value_is_preserved():
    sb = _seed_user()
    sb.db["profiles"][0]["date_of_birth"] = "1990-01-01"
    out = apply_profile_mapping(
        sb,
        "u-1",
        question_source="recruitment_question_requirements",
        question={"field_key": "date_of_birth"},
        normalized_value="1998-04-05",
        registry=_registry(),
    )
    assert out["applied"] is False
    assert sb.db["profiles"][0]["date_of_birth"] == "1990-01-01"


# ── Transformers reject invalid input ────────────────────────────────────


def test_invalid_date_is_silently_skipped():
    sb = _seed_user()
    out = apply_profile_mapping(
        sb,
        "u-1",
        question_source="recruitment_question_requirements",
        question={"field_key": "date_of_birth"},
        normalized_value="not-a-date",
        registry=_registry(),
    )
    assert out["applied"] is False
    assert out["reason"] == "invalid_value"
    assert sb.db["profiles"][0]["date_of_birth"] is None


# ── Provenance ───────────────────────────────────────────────────────────


def test_provenance_recorded_under_profiles_metadata():
    sb = _seed_user()
    apply_profile_mapping(
        sb,
        "u-1",
        question_source="recruitment_question_requirements",
        question={"field_key": "domicile_state"},
        normalized_value="Maharashtra",
        registry=_registry(),
        session_id="sess-42",
    )
    metadata = sb.db["profiles"][0]["metadata"]
    provenance = metadata["onboarding_provenance"]
    assert "profiles.domicile_state" in provenance
    assert "aspirant_location.state" in provenance
    entry = provenance["profiles.domicile_state"]
    assert entry["source"] == "recruitment_question_requirements"
    assert entry["session_id"] == "sess-42"
    assert "answered_at" in entry


# ── Stitch → canonical → recompute ───────────────────────────────────────


def test_stitch_writes_canonical_and_enqueues_recompute(monkeypatch):
    """End-to-end: anonymous recruitment answer → login → stitch reaches canonical."""
    sb = SBStub(
        {
            "profiles": [{"id": "u-stitch", "date_of_birth": None, "domicile_state": None, "metadata": {}}],
            "aspirant_location": [],
            "funnel_sessions": [],
            "onboarding_sessions": [
                {"id": "os-7", "anonymous_id": "anon-9", "user_id": None, "status": "active",
                 "entry_mode": "cta", "intent": "check_eligibility", "question_count": 1,
                 "created_at": "2026-01-01T00:00:00+00:00"}
            ],
            "onboarding_session_answers": [
                {
                    "id": "ans-1",
                    "session_id": "os-7",
                    "anonymous_id": "anon-9",
                    "user_id": None,
                    "question_source": "recruitment_question_requirements",
                    "question_key": "domicile_state",
                    "answer_value": "Maharashtra",
                    "normalized_value": "Maharashtra",
                    "skipped": False,
                }
            ],
            "onboarding_answers": [],
            "persona_question_answers": [],
            "candidate_field_registry": field_registry(),
        }
    )
    # Registry needs the domicile_state row our stitch helper uses for sensitivity check.
    sb.db["candidate_field_registry"].append(
        {
            "field_key": "domicile_state",
            "profile_group": "location",
            "canonical_label": "Domicile state",
            "data_type": "single_select",
            "profile_table": "profiles",
            "profile_column": "domicile_state",
            "is_active": True,
        }
    )

    enqueued: list[tuple[str, str]] = []

    def _fake_enqueue(supabase, user_id, reason):
        enqueued.append((user_id, reason))

    # Patch the late import inside _enqueue_recompute.
    import sys
    import types

    mod = types.ModuleType("app.eligibility.recompute_queue")
    mod.enqueue_eligibility_recompute = _fake_enqueue
    monkeypatch.setitem(sys.modules, "app.eligibility.recompute_queue", mod)

    result = stitch_anonymous_sessions(sb, "anon-9", "u-stitch")

    assert result["stitched"] is True
    assert result["canonical_writes"] >= 1
    assert result["recompute_enqueued"] is True
    assert enqueued == [("u-stitch", "unified_onboarding_stitch")]
    # And canonical truth reflects the anonymous answer.
    assert sb.db["profiles"][0]["domicile_state"] == "Maharashtra"
    assert sb.db["aspirant_location"][0]["state"] == "Maharashtra"
