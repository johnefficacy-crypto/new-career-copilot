"""Unit tests for ``app.eligibility.education_taxonomy``.

The taxonomy replaces the engine's previous 6-entry ``_EDU_LEVEL_ORDER``
dict. Tests pin alias coverage (the main user-facing improvement),
rank ordering, and back-compat against the legacy slug set.
"""
from __future__ import annotations

import pytest

from app.eligibility.education_taxonomy import (
    EDUCATION_TAXONOMY,
    EducationLevel,
    ancestors,
    canonical_level,
    is_at_least,
    level_rank,
)


# ── Taxonomy invariants ────────────────────────────────────────────────────


def test_taxonomy_keys_match_slugs():
    for key, node in EDUCATION_TAXONOMY.items():
        assert key == node.slug


def test_taxonomy_no_alias_collisions():
    seen: dict[str, str] = {}
    for slug, node in EDUCATION_TAXONOMY.items():
        for alias in node.aliases:
            assert alias not in seen, (
                f"alias {alias!r} maps to both {seen[alias]!r} and {slug!r}"
            )
            seen[alias] = slug


def test_taxonomy_ranks_strictly_ascend_along_canonical_ladder():
    # 10th < 12th < graduate < postgraduate < phd. (Diploma sits beside
    # 12th and has its own rank; it's not on the strict ladder above.)
    ranks = {slug: EDUCATION_TAXONOMY[slug].rank for slug in EDUCATION_TAXONOMY}
    assert ranks["10th"] < ranks["12th"] < ranks["graduate"]
    assert ranks["graduate"] < ranks["postgraduate"] < ranks["phd"]


def test_taxonomy_parents_resolve():
    for slug, node in EDUCATION_TAXONOMY.items():
        if node.parent is not None:
            assert node.parent in EDUCATION_TAXONOMY, (
                f"{slug!r} parent {node.parent!r} not in taxonomy"
            )


# ── canonical_level ────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "text,expected",
    [
        # Legacy slugs (back-compat).
        ("10th", "10th"),
        ("12th", "12th"),
        ("diploma", "diploma"),
        ("graduate", "graduate"),
        ("postgraduate", "postgraduate"),
        ("phd", "phd"),
        # Aliases the legacy dict missed.
        ("SSC", "10th"),
        ("Matric", "10th"),
        ("Matriculation", "10th"),
        ("Class 10", "10th"),
        ("Class X", "10th"),
        ("HSC", "12th"),
        ("Class 12", "12th"),
        ("Intermediate", "12th"),
        ("10+2", "12th"),
        ("Senior Secondary", "12th"),
        ("Polytechnic", "diploma"),
        ("ITI", "diploma"),
        ("B.Tech", "graduate"),
        ("B.E.", "graduate"),
        ("BTech", "graduate"),
        ("Bachelor's", "graduate"),
        ("Bachelors", "graduate"),
        ("BSc", "graduate"),
        ("B.Sc.", "graduate"),
        ("B.Com", "graduate"),
        ("BBA", "graduate"),
        ("LLB", "graduate"),
        ("B.Ed", "graduate"),
        ("Undergraduate", "graduate"),
        ("M.Tech", "postgraduate"),
        ("MA", "postgraduate"),
        ("M.Sc.", "postgraduate"),
        ("M.Com", "postgraduate"),
        ("Master's", "postgraduate"),
        ("MBA", "postgraduate"),
        ("PGDM", "postgraduate"),
        ("LLM", "postgraduate"),
        ("MPhil", "postgraduate"),
        ("Ph.D.", "phd"),
        ("PhD", "phd"),
        ("Doctorate", "phd"),
        ("D.Phil", "phd"),
        # Unknown → None.
        ("ATypicalCert", None),
        ("", None),
        (None, None),
    ],
)
def test_canonical_level(text, expected):
    assert canonical_level(text) == expected


def test_canonical_level_prefers_longer_alias_in_phrase():
    # "senior secondary" must win over "secondary" alone.
    assert canonical_level("Senior Secondary") == "12th"


def test_canonical_level_handles_punctuation_and_separators():
    # Various punctuations should still resolve.
    assert canonical_level("B-Tech in CSE") == "graduate"
    assert canonical_level("M_Sc Physics") == "postgraduate"


def test_canonical_level_does_not_match_inside_unrelated_word():
    # Whole-word: "ba" must NOT match inside "baker" or "barber".
    assert canonical_level("baker") is None
    assert canonical_level("barber college") is None


# ── level_rank ─────────────────────────────────────────────────────────────


def test_level_rank_legacy_slugs():
    assert level_rank("10th") < level_rank("12th") < level_rank("graduate")
    assert level_rank("graduate") < level_rank("postgraduate") < level_rank("phd")


def test_level_rank_aliases_resolve_to_same_rank_as_canonical():
    assert level_rank("B.Tech") == level_rank("graduate")
    assert level_rank("PGDM") == level_rank("postgraduate")
    assert level_rank("Matric") == level_rank("10th")


def test_level_rank_unknown_returns_zero():
    # Conservative: an unrecognised level produces rank 0 so any non-
    # zero requirement automatically fails.
    assert level_rank("ATypicalCert") == 0
    assert level_rank(None) == 0
    assert level_rank("") == 0


# ── is_at_least ────────────────────────────────────────────────────────────


def test_is_at_least_satisfies_self():
    for slug in EDUCATION_TAXONOMY:
        assert is_at_least(slug, slug) is True


def test_is_at_least_higher_satisfies_lower():
    assert is_at_least("graduate", "10th") is True
    assert is_at_least("postgraduate", "graduate") is True
    assert is_at_least("phd", "postgraduate") is True


def test_is_at_least_lower_does_not_satisfy_higher():
    assert is_at_least("10th", "graduate") is False
    assert is_at_least("graduate", "phd") is False


def test_is_at_least_accepts_aliases_on_either_side():
    assert is_at_least("B.Tech", "12th") is True
    assert is_at_least("Master's", "Bachelor's") is True
    assert is_at_least("Class 10", "graduate") is False


def test_is_at_least_with_no_requirement_is_true():
    # Empty / None requirement = no constraint.
    assert is_at_least("anything", None) is True
    assert is_at_least(None, None) is True
    assert is_at_least(None, "") is True


def test_is_at_least_unknown_requirement_passes():
    # An unrecognised requirement (rank 0) is treated as no constraint
    # — matches the legacy semantics so admin-data hiccups don't
    # spuriously fail every candidate.
    assert is_at_least("graduate", "TotallyUnknownLevel") is True


def test_is_at_least_unknown_user_level_fails_known_requirement():
    assert is_at_least("TotallyUnknownLevel", "graduate") is False


# ── ancestors helper ───────────────────────────────────────────────────────


def test_ancestors_returns_chain_to_root():
    chain = ancestors("phd")
    assert chain[0] == "phd"
    # Walking up: phd → postgraduate → graduate → 12th → 10th.
    assert "postgraduate" in chain
    assert "graduate" in chain
    assert "12th" in chain
    assert "10th" in chain


def test_ancestors_for_root_returns_singleton():
    assert ancestors("10th") == ["10th"]


def test_ancestors_for_unknown_returns_chain_from_input():
    # No node lookup; just returns the input (mirrors a "leaf" with
    # no known parent). Caller can ignore.
    assert ancestors("unknown") == ["unknown"]
