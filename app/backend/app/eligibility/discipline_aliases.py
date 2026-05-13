"""Discipline alias registry for the eligibility engine.

Replaces the engine's previous substring-based discipline match
(``d in user_stream``), which had clear false positives — ``"cs"``
matched ``"physics"``, ``"ai"`` matched ``"marine_engineering"``,
``"me"`` matched ``"medicine"``.

Two-step contract used by the engine:

1. **Canonical bucket match.** Each side (user education and canonical
   criterion) is normalised to one or more canonical bucket slugs via
   :func:`canonical_disciplines`. If the buckets intersect, the
   candidate's discipline is accepted.
2. **Word-boundary fallback.** When *either* side has no canonical
   bucket (rare specialist degrees, novel scrape tokens), the engine
   falls back to a tokenised whole-word match instead of the raw
   substring match. This keeps coverage broad while eliminating the
   ``cs`` ⊂ ``physics`` class of false positives.

Registry coverage focuses on Indian government-recruitment disciplines:
engineering branches, core sciences, management, law, medicine,
education, commerce, and arts. New buckets and aliases can be added
without touching the engine.
"""
from __future__ import annotations

import re
from typing import Iterable


# Canonical slug → set of surface forms. Each surface form is
# lowercase, whitespace-normalised. Tokens like ``cse``, full names
# ``computer science``, and common variations ``computer science and
# engineering`` all collapse to one bucket.
DISCIPLINE_ALIASES: dict[str, frozenset[str]] = {
    # ── Engineering branches ────────────────────────────────────────────
    "computer_science": frozenset({
        "cs", "cse", "cs&e", "computer science", "computer engineering",
        "computer science and engineering", "computer science & engineering",
        "computer applications", "mca",
        "information technology", "it", "i.t.",
        "software engineering",
    }),
    "electronics": frozenset({
        "ec", "ece", "ete",
        "electronics", "electronics engineering",
        "electronics and communication", "electronics & communication",
        "electronics and communication engineering",
        "electronics and telecommunication", "electronics & telecommunication",
        "telecommunication", "telecommunications",
    }),
    "electrical": frozenset({
        "ee", "eee",
        "electrical", "electrical engineering",
        "electrical and electronics", "electrical & electronics",
        "electrical and electronics engineering",
        "power engineering", "power systems",
    }),
    "mechanical": frozenset({
        "me", "mech",
        "mechanical", "mechanical engineering",
        "production engineering", "manufacturing engineering",
        "industrial engineering",
    }),
    "civil": frozenset({
        "ce",
        "civil", "civil engineering",
        "structural engineering", "construction engineering",
        "environmental engineering", "transportation engineering",
    }),
    "chemical": frozenset({
        "ch", "che",
        "chemical", "chemical engineering", "chemical technology",
    }),
    "aerospace": frozenset({
        "ae",
        "aero", "aerospace", "aeronautical",
        "aerospace engineering", "aeronautical engineering",
    }),
    "materials": frozenset({
        "mt", "mat",
        "materials", "materials engineering", "materials science",
        "metallurgy", "metallurgical engineering",
    }),
    "instrumentation": frozenset({
        "ei", "ice",
        "instrumentation", "instrumentation engineering",
        "electronics and instrumentation",
        "instrumentation and control",
    }),
    "biomedical": frozenset({
        "bme",
        "biomedical", "biomedical engineering",
        "bio-medical", "bioengineering",
    }),
    "agricultural_engineering": frozenset({
        "ag",
        "agricultural engineering",
        "agriculture engineering",
        "food technology", "food engineering", "food processing",
    }),
    "mining": frozenset({
        "mining", "mining engineering",
    }),
    "petroleum": frozenset({
        "petroleum", "petroleum engineering",
    }),
    "marine": frozenset({
        "marine", "marine engineering", "naval architecture",
    }),

    # ── Core sciences ───────────────────────────────────────────────────
    "physics": frozenset({
        "physics", "applied physics", "engineering physics",
    }),
    "chemistry": frozenset({
        "chemistry", "applied chemistry",
    }),
    "mathematics": frozenset({
        "math", "maths", "mathematics", "applied mathematics", "statistics",
    }),
    "biology": frozenset({
        "biology", "life sciences", "zoology", "botany",
        "biotechnology", "biotech",
        "microbiology", "biochemistry", "molecular biology",
    }),
    "geology": frozenset({
        "geology", "geophysics", "earth sciences",
    }),

    # ── Professional / vocational ───────────────────────────────────────
    "management": frozenset({
        "mba", "pgdm",
        "management", "business administration",
        "business management",
    }),
    "commerce": frozenset({
        "b.com", "bcom", "m.com", "mcom",
        "commerce", "accountancy", "accounting",
    }),
    "economics": frozenset({
        "economics", "econometrics",
    }),
    "law": frozenset({
        "law", "llb", "llm", "ll.b", "ll.m",
        "legal studies",
    }),
    "medicine": frozenset({
        "mbbs", "md",
        "medicine", "medical",
        "pharmacy", "b.pharm", "m.pharm",
        "nursing", "b.sc nursing",
    }),
    "veterinary": frozenset({
        "veterinary", "veterinary science", "vetinary medicine", "bvsc",
    }),
    "dental": frozenset({
        "bds", "dental", "dentistry",
    }),

    # ── Arts / humanities ───────────────────────────────────────────────
    "arts": frozenset({
        "ba", "b.a.", "ma", "m.a.", "arts",
        "english", "english literature",
        "history", "political science", "sociology", "psychology",
        "philosophy", "geography",
    }),
    "education": frozenset({
        "b.ed", "bed", "m.ed", "med", "education",
        "teaching", "pedagogy",
    }),
    "fine_arts": frozenset({
        "bfa", "mfa", "fine arts", "visual arts", "design", "applied arts",
    }),
    "journalism": frozenset({
        "journalism", "mass communication", "media studies",
    }),
}


# Reverse map for fast alias → canonical lookup. Built once at import.
_ALIAS_TO_CANONICAL: dict[str, str] = {
    alias: canonical
    for canonical, aliases in DISCIPLINE_ALIASES.items()
    for alias in aliases
}


# Pre-built sorted list of aliases. Longer aliases first so substring
# searches prefer specific phrases (e.g. ``"computer science"`` before
# ``"cs"``).
_ALIAS_PATTERNS: list[tuple[str, str]] = sorted(
    _ALIAS_TO_CANONICAL.items(),
    key=lambda item: (-len(item[0]), item[0]),
)


def _normalise(text: str | None) -> str:
    """Lowercase and collapse separators that tokenize disciplines."""
    if not text:
        return ""
    s = str(text).lower().strip()
    # Collapse various separators into single spaces so phrase matches
    # against the registry work uniformly across input styles.
    s = re.sub(r"[/&|,;]+", " ", s)
    s = re.sub(r"[\-_]+", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s


def canonical_disciplines(text: str | None) -> set[str]:
    """Return the set of canonical discipline slugs found in `text`.

    Looks for any registered alias as a whole-word substring (case-
    insensitive). Returns an empty set when no alias matches. The set
    can contain multiple slugs if the text combines disciplines (e.g.
    ``"computer science and electronics"``).
    """
    normalised = _normalise(text)
    if not normalised:
        return set()
    out: set[str] = set()
    # Wrap with spaces so word-boundary checks at edges work cheaply.
    haystack = f" {normalised} "
    for alias, canonical in _ALIAS_PATTERNS:
        if canonical in out:
            continue  # already collected via a longer alias
        # Whole-word presence: alias must be flanked by space or the
        # padded edge.
        needle = f" {alias} "
        if needle in haystack:
            out.add(canonical)
    return out


def disciplines_intersect(
    user_surface_forms: Iterable[str | None],
    criteria_surface_forms: Iterable[str | None],
) -> bool:
    """True when any canonical bucket is shared by both sides.

    Used by the engine to gate education-discipline checks. Returns
    ``False`` if either side has no canonical buckets — the engine then
    falls back to a word-boundary match.
    """
    user_buckets: set[str] = set()
    for s in user_surface_forms:
        user_buckets |= canonical_disciplines(s)
    if not user_buckets:
        return False
    criteria_buckets: set[str] = set()
    for s in criteria_surface_forms:
        criteria_buckets |= canonical_disciplines(s)
    if not criteria_buckets:
        return False
    return bool(user_buckets & criteria_buckets)


def word_boundary_match(
    user_surface_forms: Iterable[str | None],
    criteria_surface_forms: Iterable[str | None],
) -> bool:
    """Fallback: tokenized whole-word containment in either direction.

    Used when at least one side has no canonical bucket. Replaces the
    legacy raw substring check (``d in user_stream``) so ``"cs"`` no
    longer matches ``"physics"``.
    """
    user_tokens: set[str] = set()
    for s in user_surface_forms:
        user_tokens |= set(_normalise(s).split())
    criteria_tokens_per_form: list[set[str]] = []
    for s in criteria_surface_forms:
        toks = set(_normalise(s).split())
        if toks:
            criteria_tokens_per_form.append(toks)
    if not user_tokens or not criteria_tokens_per_form:
        return False
    # Match if any criterion's full token set is a subset of the user
    # tokens (so ``["computer", "science"]`` matches a user stream of
    # ``"computer science and engineering"``).
    return any(toks <= user_tokens for toks in criteria_tokens_per_form)
