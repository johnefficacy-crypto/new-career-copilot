"""Unit tests for ``app.eligibility.discipline_aliases``.

The registry replaces the engine's previous substring-based discipline
match. Tests pin the false-positive elimination (``cs`` ⊂ ``physics``)
and the synonym handling (``CSE`` ↔ ``Computer Science``).
"""
from __future__ import annotations

import pytest

from app.eligibility.discipline_aliases import (
    DISCIPLINE_ALIASES,
    canonical_disciplines,
    disciplines_intersect,
    word_boundary_match,
)


# ── Registry invariants ────────────────────────────────────────────────────


def test_registry_has_no_alias_collisions():
    """An alias must map to exactly one canonical bucket."""
    seen: dict[str, str] = {}
    for canonical, aliases in DISCIPLINE_ALIASES.items():
        for alias in aliases:
            assert alias not in seen, (
                f"alias {alias!r} maps to both {seen[alias]!r} and {canonical!r}"
            )
            seen[alias] = canonical


def test_registry_aliases_are_lowercase_and_trimmed():
    for canonical, aliases in DISCIPLINE_ALIASES.items():
        for alias in aliases:
            assert alias == alias.lower().strip(), (
                f"alias {alias!r} in bucket {canonical!r} is not pre-normalised"
            )


# ── canonical_disciplines ───────────────────────────────────────────────────


@pytest.mark.parametrize(
    "text,expected",
    [
        ("CSE", {"computer_science"}),
        ("Computer Science", {"computer_science"}),
        ("Computer Science and Engineering", {"computer_science"}),
        ("B.Tech in CSE", {"computer_science"}),
        ("Electronics & Communication", {"electronics"}),
        ("ECE", {"electronics"}),
        ("Mechanical Engineering", {"mechanical"}),
        ("MBA", {"management"}),
        ("LLB", {"law"}),
        ("MBBS", {"medicine"}),
        ("", set()),
        (None, set()),
        ("Sanskritology", set()),  # not in registry → empty
    ],
)
def test_canonical_disciplines(text, expected):
    assert canonical_disciplines(text) == expected


def test_canonical_disciplines_picks_up_multiple_buckets():
    # Combined-field degrees should produce both buckets.
    out = canonical_disciplines("Computer Science and Electronics")
    assert "computer_science" in out
    assert "electronics" in out


def test_cs_does_not_match_physics():
    # The exact false positive the registry was built to eliminate.
    out = canonical_disciplines("Physics")
    assert "computer_science" not in out
    assert out == {"physics"}


def test_me_does_not_match_medicine():
    out = canonical_disciplines("Medicine")
    assert "mechanical" not in out
    assert out == {"medicine"}


def test_ai_does_not_match_marine():
    # "ai" is not even in the registry, but verify the word-boundary
    # logic doesn't get fooled by inner-letter substrings.
    out = canonical_disciplines("Marine Engineering")
    assert out == {"marine"}


def test_canonical_disciplines_handles_separator_normalisation():
    # Slashes, underscores, hyphens, commas all collapse to whitespace.
    assert canonical_disciplines("Electronics/Communication") == {"electronics"}
    assert canonical_disciplines("computer-science") == {"computer_science"}
    assert canonical_disciplines("electrical_engineering") == {"electrical"}
    assert canonical_disciplines("Computer Science, Electronics") == {
        "computer_science", "electronics",
    }


# ── disciplines_intersect ──────────────────────────────────────────────────


def test_intersect_picks_up_alias_match_across_sides():
    # Criterion uses the short slug, user uses the full name.
    assert disciplines_intersect(["B.Tech in Computer Science"], ["cse"]) is True


def test_intersect_returns_false_when_neither_side_canonical():
    # Both sides are unknown to the registry. Caller should use the
    # word-boundary fallback after this returns False.
    assert disciplines_intersect(["Underwater basketweaving"], ["aquatic crafts"]) is False


def test_intersect_returns_false_when_only_one_side_canonical():
    assert disciplines_intersect(["CSE"], ["Underwater basketweaving"]) is False
    assert disciplines_intersect(["Underwater basketweaving"], ["CSE"]) is False


def test_intersect_handles_none_and_empty_inputs():
    assert disciplines_intersect([None, ""], ["CSE"]) is False
    assert disciplines_intersect(["CSE"], [None]) is False


def test_intersect_is_case_insensitive():
    assert disciplines_intersect(["computer science"], ["CSE"]) is True
    assert disciplines_intersect(["MECHANICAL ENGINEERING"], ["me"]) is True


# ── word_boundary_match ────────────────────────────────────────────────────


def test_word_boundary_match_passes_for_full_phrase_subset():
    # Criterion phrase = ["computer", "science"]. User text contains
    # both tokens. Match.
    assert word_boundary_match(
        ["Computer Science and Engineering"], ["computer science"]
    ) is True


def test_word_boundary_match_rejects_cs_in_physics():
    # The regression the registry exists to prevent. Even the fallback
    # (whole-word) match should reject this.
    assert word_boundary_match(["physics"], ["cs"]) is False


def test_word_boundary_match_rejects_me_in_medicine():
    assert word_boundary_match(["medicine"], ["me"]) is False


def test_word_boundary_match_passes_for_exact_single_token():
    assert word_boundary_match(["genetics"], ["genetics"]) is True


def test_word_boundary_match_handles_empty_inputs():
    assert word_boundary_match([], ["cs"]) is False
    assert word_boundary_match(["cse"], []) is False
    assert word_boundary_match([None, ""], ["cs"]) is False
