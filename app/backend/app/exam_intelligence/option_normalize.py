"""Canonical text normalisation + sha256 hashing for PYQ options/questions.

Centralised so the CMS write path and the backfill admin endpoint use
the same canonical form. Whitespace + casing variants that should be
treated as identical end up with the same hash, which is what the
option-level analytics rollups (``pyq_option_repetitions``) need to
dedupe correctly.
"""
from __future__ import annotations

import hashlib
import re
import unicodedata

# Strip a leading option label like "A.", "A)", "(A)", "1.", "1)", "i)" —
# common when scraped option text accidentally bundles the label.
_LEADING_LABEL = re.compile(
    r"^\s*[\(\[]?([A-Da-d]|[0-9]{1,2}|[ivxIVX]{1,4})[\)\].:]\s*"
)

# Smart quotes / unicode dashes / nbsp → ASCII so visually-identical
# strings hash to the same digest.
_UNICODE_FOLDS = str.maketrans(
    {
        "‘": "'", "’": "'", "‚": "'", "‛": "'",
        "“": '"', "”": '"', "„": '"', "‟": '"',
        "–": "-", "—": "-", "−": "-",
        " ": " ", " ": " ", "​": "",
    }
)


def normalize_option_text(text: str | None) -> str:
    """Canonical form used as input to ``option_hash``.

    - unicode-NFC, smart-punct → ASCII, collapse whitespace
    - strip a leading "A. " / "(a) " / "1) " label if present
    - lowercase
    - drop edge punctuation (a trailing period or comma doesn't change
      the meaning of an option)
    """
    if not text:
        return ""
    t = unicodedata.normalize("NFC", str(text)).translate(_UNICODE_FOLDS)
    t = _LEADING_LABEL.sub("", t, count=1)
    t = re.sub(r"\s+", " ", t).strip()
    t = t.strip(" .,;:!?")
    return t.lower()


def option_hash(text: str | None) -> str | None:
    """sha256 hex digest of the canonical option text, or ``None`` if empty."""
    canon = normalize_option_text(text)
    if not canon:
        return None
    return hashlib.sha256(canon.encode("utf-8")).hexdigest()


def normalize_question_text(text: str | None) -> str:
    """Canonical form for question text.

    Looser than option normalisation — we keep edge punctuation since a
    trailing question mark meaningfully changes a question, but we still
    NFC-normalise, fold smart punctuation, collapse whitespace, and
    lowercase.
    """
    if not text:
        return ""
    t = unicodedata.normalize("NFC", str(text)).translate(_UNICODE_FOLDS)
    t = re.sub(r"\s+", " ", t).strip()
    return t.lower()


def question_hash(text: str | None) -> str | None:
    canon = normalize_question_text(text)
    if not canon:
        return None
    return hashlib.sha256(canon.encode("utf-8")).hexdigest()
