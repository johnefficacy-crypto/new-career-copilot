"""Education-level taxonomy for the eligibility engine.

Replaces the engine's previous hardcoded ``_EDU_LEVEL_ORDER`` dict
(6 entries keyed by exact lowercase string) with a richer structure
that:

* Carries a canonical slug, a human-readable name, a numeric rank used
  for ladder comparisons, and a parent pointer for hierarchy.
* Recognises common surface-form aliases out of the box — ``"Matric"``,
  ``"SSC"``, ``"Class 10"`` all resolve to the ``"10th"`` slug;
  ``"B.Tech"``, ``"BSc"``, ``"Bachelor's"`` all resolve to
  ``"graduate"``.
* Is purely Python so no migration is required. A DB-backed override
  layer can be added later if admin-editable taxonomy becomes
  valuable.

The engine consumes :func:`canonical_level` and :func:`level_rank` —
unknown strings continue to return ``0`` so existing data that
happened to slip past the registry keeps producing a (conservative)
verdict.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class EducationLevel:
    """One node in the education ladder.

    ``rank`` is a coarse numeric ordering used by ``is_at_least`` and
    the engine's existing rank-based comparisons. Higher = more
    advanced. Spacing leaves room for intermediate nodes
    (post-doctoral, fellowship, etc.) without renumbering everything.
    """

    slug: str
    name: str
    rank: int
    parent: str | None
    aliases: frozenset[str]


# Canonical taxonomy. New nodes can be added without touching the
# engine — the engine only consults ``canonical_level`` and the rank.
EDUCATION_TAXONOMY: dict[str, EducationLevel] = {
    "10th": EducationLevel(
        slug="10th",
        name="10th / Secondary",
        rank=10,
        parent=None,
        aliases=frozenset({
            "10th", "10",
            "ssc", "ssc board",
            "x", "class x", "class 10",
            "secondary", "secondary school",
            "matric", "matriculation",
        }),
    ),
    "12th": EducationLevel(
        slug="12th",
        name="12th / Senior Secondary",
        rank=12,
        parent="10th",
        aliases=frozenset({
            "12th", "12",
            "hsc", "hsc board",
            "xii", "class xii", "class 12",
            "senior secondary",
            "intermediate",
            "puc", "pu", "pre university", "pre-university",
            "10+2", "10 plus 2",
        }),
    ),
    "diploma": EducationLevel(
        slug="diploma",
        name="Diploma / Polytechnic",
        rank=14,
        parent="10th",
        aliases=frozenset({
            "diploma",
            "polytechnic",
            "iti",
            "advanced diploma",
        }),
    ),
    "graduate": EducationLevel(
        slug="graduate",
        name="Graduate / Bachelor's",
        rank=16,
        parent="12th",
        aliases=frozenset({
            "graduate", "graduation",
            "bachelor", "bachelors", "bachelor's", "bachelor degree",
            "ug", "under graduate", "undergraduate",
            "ba", "b.a", "b.a.",
            "bsc", "b.sc", "b.sc.",
            "bcom", "b.com", "b.com.",
            "bca", "b.c.a",
            "bba", "b.b.a",
            "be", "b.e", "b.e.",
            "btech", "b.tech", "b.tech.",
            "barch", "b.arch",
            "bpharm", "b.pharm",
            "llb", "ll.b", "ll.b.",
            "bed", "b.ed", "b.ed.",
        }),
    ),
    "postgraduate": EducationLevel(
        slug="postgraduate",
        name="Postgraduate / Master's",
        rank=18,
        parent="graduate",
        aliases=frozenset({
            "postgraduate", "post graduate", "postgraduation", "post graduation",
            "master", "masters", "master's", "master degree",
            "pg",
            "ma", "m.a", "m.a.",
            "msc", "m.sc", "m.sc.",
            "mcom", "m.com", "m.com.",
            "mca", "m.c.a",
            "mtech", "m.tech", "m.tech.",
            "marc", "m.arc",
            "march", "m.arch",
            "mpharm", "m.pharm",
            "llm", "ll.m", "ll.m.",
            "med", "m.ed", "m.ed.",
            "mba", "pgdm", "pgdba",
            "mphil", "m.phil",
        }),
    ),
    "phd": EducationLevel(
        slug="phd",
        name="Doctorate / PhD",
        rank=22,
        parent="postgraduate",
        aliases=frozenset({
            "phd", "ph.d", "ph.d.",
            "doctorate",
            "dphil", "d.phil",
            "doctoral",
        }),
    ),
}


# Reverse index for fast alias → canonical lookup. Built once at import.
# Pre-sorts aliases longest-first so phrase matches prefer the more
# specific form (e.g. ``"senior secondary"`` before ``"secondary"``).
_ALIAS_TO_SLUG: dict[str, str] = {
    alias: level.slug
    for level in EDUCATION_TAXONOMY.values()
    for alias in level.aliases
}

_ALIAS_PATTERNS: list[tuple[str, str]] = sorted(
    _ALIAS_TO_SLUG.items(),
    key=lambda item: (-len(item[0]), item[0]),
)


def _normalise(text: str | None) -> str:
    """Lowercase, strip, collapse separators, fuse abbreviation pieces.

    Rules in order:
      * Lower-case and strip outer whitespace.
      * Drop periods inside abbreviations so ``"B.Tech."`` → ``"btech"``.
      * Convert ``/``, ``&``, ``|``, ``,``, ``;``, ``-``, ``_`` to spaces.
      * Join a single-char abbreviation prefix with its 1–5 char
        follower so ``"B Tech"`` → ``"btech"`` and ``"M Sc"`` → ``"msc"``.
        Restricted length keeps unrelated English (``"i am here"``)
        from being mangled.
      * Collapse runs of whitespace.
    """
    if not text:
        return ""
    s = str(text).lower().strip()
    s = re.sub(r"\.", "", s)
    s = re.sub(r"[/&|,;]+", " ", s)
    s = re.sub(r"[\-_]+", " ", s)
    s = re.sub(r"\b([a-z])\s+([a-z]{1,5})\b", r"\1\2", s)
    s = re.sub(r"\s+", " ", s)
    return s


def canonical_level(text: str | None) -> str | None:
    """Return the canonical level slug for ``text``, or ``None`` if no
    alias matches.

    Whole-word phrase matching: an alias must be flanked by space or
    the padded edge of the haystack. This stops short aliases like
    ``"ba"`` from matching inside unrelated words like ``"baker"``.
    """
    haystack = _normalise(text)
    if not haystack:
        return None
    padded = f" {haystack} "
    for alias_raw, slug in _ALIAS_PATTERNS:
        # Normalise alias the same way the input was — both go through
        # the same pipeline so "b.tech.", "btech", and "B Tech" all
        # collapse to "btech" and any of them match the others.
        alias = _normalise(alias_raw)
        if not alias:
            continue
        needle = f" {alias} "
        if needle in padded:
            return slug
    return None


def level_rank(slug_or_text: str | None) -> int:
    """Return the rank for a slug OR a free-form text input.

    Unknown inputs return ``0`` — the conservative default the engine
    has historically used so a row with garbled level still gets a
    deterministic (failing) verdict against a non-zero requirement.
    """
    if not slug_or_text:
        return 0
    text = str(slug_or_text).lower().strip()
    # Fast path: caller already passed a canonical slug.
    if text in EDUCATION_TAXONOMY:
        return EDUCATION_TAXONOMY[text].rank
    slug = canonical_level(text)
    if slug is None:
        return 0
    return EDUCATION_TAXONOMY[slug].rank


def is_at_least(user_text: str | None, required_text: str | None) -> bool:
    """Convenience: ``True`` iff the user's level is at least the required.

    Both inputs accept either a canonical slug or any registered alias.
    A user input that doesn't resolve to a known level returns
    ``False`` against any non-trivial requirement, matching the
    legacy `_edu_level_rank` semantics.
    """
    if not required_text:
        return True
    required_rank = level_rank(required_text)
    if required_rank == 0:
        return True
    return level_rank(user_text) >= required_rank


def ancestors(slug: str) -> list[str]:
    """Return slug + all parent slugs walking up the ladder.

    Useful for inheritance checks and admin tooling. Not used by the
    engine itself today; the rank comparison is sufficient.
    """
    out: list[str] = []
    current: str | None = slug
    seen: set[str] = set()
    while current and current not in seen:
        out.append(current)
        seen.add(current)
        node = EDUCATION_TAXONOMY.get(current)
        current = node.parent if node else None
    return out


def all_aliases() -> Iterable[tuple[str, str]]:
    """Yield ``(alias, slug)`` pairs. Useful for admin docs."""
    yield from _ALIAS_TO_SLUG.items()
