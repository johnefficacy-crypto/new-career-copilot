"""Unit tests for the option/question canonicaliser + hasher."""
from __future__ import annotations

from app.exam_intelligence.option_normalize import (
    normalize_option_text,
    normalize_question_text,
    option_hash,
    question_hash,
)


def test_option_normalize_collapses_whitespace_and_lowercases():
    assert normalize_option_text("  Both  1  and  2  ") == "both 1 and 2"


def test_option_normalize_strips_leading_label_variants():
    for raw in (
        "A. Both 1 and 2",
        "A) Both 1 and 2",
        "(A) Both 1 and 2",
        "1. Both 1 and 2",
        "1) Both 1 and 2",
        "(i) Both 1 and 2",
    ):
        assert normalize_option_text(raw) == "both 1 and 2", raw


def test_option_normalize_strips_edge_punctuation():
    assert normalize_option_text("Both 1 and 2.") == "both 1 and 2"
    assert normalize_option_text(".Both 1 and 2.") == "both 1 and 2"


def test_option_normalize_folds_smart_punct_and_dashes():
    assert normalize_option_text("“Smart” – quotes") == '"smart" - quotes'
    # Non-breaking space + zero-width space → ASCII space / empty.
    assert normalize_option_text("1 only") == "1 only"
    assert normalize_option_text("1​only") == "1only"


def test_option_normalize_empty_inputs():
    assert normalize_option_text(None) == ""
    assert normalize_option_text("") == ""
    assert normalize_option_text("   ") == ""


def test_option_hash_is_stable_across_visual_variants():
    canonical = option_hash("Both 1 and 2")
    for variant in (
        "  Both 1 and 2  ",
        "BOTH 1 AND 2",
        "A. Both 1 and 2",
        "(a) Both 1 and 2.",
        "both 1 and 2",
    ):
        assert option_hash(variant) == canonical, variant


def test_option_hash_distinguishes_distinct_text():
    assert option_hash("1 only") != option_hash("2 only")
    assert option_hash("Both 1 and 2") != option_hash("Both 1 and 3")


def test_option_hash_none_for_empty():
    assert option_hash(None) is None
    assert option_hash("") is None
    assert option_hash("   ") is None
    # A leading-label-only input also normalises to "" → None.
    assert option_hash("A.") is None


def test_question_normalize_preserves_terminal_punctuation():
    # Question marks/periods are meaningful at the end of a question.
    assert normalize_question_text("What is X?") == "what is x?"
    assert normalize_question_text("  Consider  the  following.  ") == "consider the following."


def test_question_hash_stable_for_whitespace_variants():
    assert question_hash("What is X?") == question_hash(" what is  x? ")
    assert question_hash(None) is None
    assert question_hash("") is None
