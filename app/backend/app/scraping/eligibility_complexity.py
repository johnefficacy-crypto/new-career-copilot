"""Eligibility complexity detector for the Recruitment Verification Gateway.

Plan §5. Scans an extracted recruitment payload for conditional /
ambiguous eligibility patterns the deterministic engine *might* not
yet represent. Each detection produces an
:class:`EligibilityComplexitySignal` carrying:

* ``flag`` — short identifier (e.g. ``"requires_domicile"``).
* ``field_key`` — the canonical profile field the rule would key on
  (e.g. ``"profile.domicile_state"``).
* ``source_field_path`` — where in the payload the signal was found.
* ``blocking_level`` — how it gates promotion/publish.
* ``evidence_summary_key`` — optional link into the report's
  ``evidence_summary`` jsonb for the snippet.

The detector is pure. It never queries the eligibility tables. Whether
a detected signal is *unrepresented* in canonical rules — and thus
should block publish — is the job of
:mod:`app.eligibility.complexity_contract`.

Detection coverage (plan §5):

    domicile, language, GATE score, experience,
    discipline-specific degree, first-class requirement,
    category relaxation, PwBD horizontal reservation,
    ex-serviceman rules, physical standards, medical standards,
    certificates, attempts (Tier A age relaxation)
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Iterable


@dataclass
class EligibilityComplexitySignal:
    """Plain dataclass mirror of the pydantic schema.

    The pydantic class lives in :mod:`verification_report_schemas` for
    jsonb validation; this dataclass is the in-process working form
    the detector emits.
    """

    flag: str
    field_key: str
    source_field_path: str
    blocking_level: str
    evidence_summary_key: str | None = None


# ── Detection table ──────────────────────────────────────────────────
#
# Each entry: keyword patterns + the flag/field_key/blocking_level to
# emit when at least one pattern matches.

_DETECTORS: tuple[dict[str, Any], ...] = (
    {
        "flag": "requires_domicile",
        "field_key": "profile.domicile_state",
        "patterns": (
            r"\bdomicile\b",
            r"\blocal\s+resident\b",
            r"\bstate\s+resident\b",
            r"\bbonafide\s+resident\b",
        ),
        "blocking_level": "publish_blocker",
    },
    {
        "flag": "requires_language",
        "field_key": "profile.languages_known",
        "patterns": (
            r"\bworking\s+knowledge\s+of\b",
            r"\bregional\s+language\b",
            r"\b(?:hindi|tamil|telugu|marathi|kannada|bengali|gujarati|punjabi|malayalam|odia)\s+(?:language|proficiency)\b",
            r"\bvernacular\b",
        ),
        "blocking_level": "publish_blocker",
    },
    {
        "flag": "requires_gate_score",
        "field_key": "profile.exam_scores.gate",
        "patterns": (
            r"\bgate\s+score\b",
            r"\bvalid\s+gate\b",
            r"\bthrough\s+gate\b",
            r"\bgate[-\s]based\b",
        ),
        "blocking_level": "publish_blocker",
    },
    {
        "flag": "requires_experience",
        "field_key": "profile.work_experience_years",
        "patterns": (
            r"\b\d+\s+years?\s+(?:of\s+)?(?:work\s+|relevant\s+|post[-\s]?qualification\s+)?experience\b",
            r"\bminimum\s+experience\b",
            r"\bexperience\s+required\b",
        ),
        "blocking_level": "publish_blocker",
    },
    {
        "flag": "requires_discipline_specific_degree",
        "field_key": "profile.education.discipline",
        "patterns": (
            r"\bdegree\s+in\s+\w+\s+engineering\b",
            r"\bspecialisation\s+in\b",
            r"\bdiscipline[-\s]specific\b",
            r"\bbranch[-\s]specific\b",
        ),
        "blocking_level": "publish_blocker",
    },
    {
        "flag": "requires_first_class",
        "field_key": "profile.education.classification",
        "patterns": (
            r"\bfirst\s+class\b",
            r"\bfirst\s+division\b",
            r"\b(?:minimum|at\s+least)\s+(?:60|65|70|75)\s*%\b",
        ),
        "blocking_level": "warning",
    },
    {
        "flag": "category_relaxation",
        "field_key": "profile.category",
        "patterns": (
            r"\bage\s+relaxation\b",
            r"\b(?:sc|st|obc|ews|pwbd|pwd)\s+candidates?\b",
            r"\bcategory[-\s]wise\s+relaxation\b",
            r"\breservation\s+as\s+per\b",
        ),
        "blocking_level": "warning",
    },
    {
        "flag": "pwbd_horizontal_reservation",
        "field_key": "profile.pwbd_status",
        "patterns": (
            r"\bpwbd\b",
            r"\bpersons\s+with\s+benchmark\s+disabilit",
            r"\bpwd\b",
            r"\bdivyangjan\b",
        ),
        "blocking_level": "conditional_result_allowed",
    },
    {
        "flag": "ex_serviceman_rules",
        "field_key": "profile.ex_serviceman_status",
        "patterns": (
            r"\bex[-\s]?serviceman\b",
            r"\bex[-\s]?servicemen\b",
            r"\bdefence\s+personnel\b",
        ),
        "blocking_level": "conditional_result_allowed",
    },
    {
        "flag": "physical_standards",
        "field_key": "profile.physical_standards",
        "patterns": (
            r"\bphysical\s+(?:standards?|test)\b",
            r"\bheight\s+requirement\b",
            r"\bchest\s+measurement\b",
            r"\bphysical\s+efficiency\b",
            r"\b(?:pet|pst)\b",
        ),
        "blocking_level": "publish_blocker",
    },
    {
        "flag": "medical_standards",
        "field_key": "profile.medical_standards",
        "patterns": (
            r"\bmedical\s+(?:standards?|fitness|examination)\b",
            r"\bmedically\s+fit\b",
            r"\bcolour\s+vision\b",
        ),
        "blocking_level": "warning",
    },
    {
        "flag": "requires_certificates",
        "field_key": "profile.certificates",
        "patterns": (
            r"\bprofessional\s+certificate\b",
            r"\bvalid\s+licen[cs]e\b",
            r"\bcertificate\s+of\b\s+\w+",
            r"\bnocs?\b",
        ),
        "blocking_level": "warning",
    },
    {
        "flag": "max_attempts",
        "field_key": "profile.attempts_remaining",
        "patterns": (
            r"\bnumber\s+of\s+attempts\b",
            r"\bmaximum\s+attempts?\b",
            r"\battempts?\s+limit\b",
            r"\battempts?\s+allowed\b",
        ),
        "blocking_level": "publish_blocker",
    },
)


def _compile_patterns(detectors: Iterable[dict[str, Any]]):
    compiled = []
    for d in detectors:
        regexes = tuple(re.compile(p, re.IGNORECASE) for p in d["patterns"])
        compiled.append({**d, "regexes": regexes})
    return tuple(compiled)


_COMPILED = _compile_patterns(_DETECTORS)


def _gather_text(extracted: dict[str, Any]) -> tuple[str, dict[str, list[str]]]:
    """Flatten the relevant extracted-data text + record where each field came from.

    Returns ``(combined_text, source_paths_per_signal_kind)``. The
    second mapping is field_name → list of paths so the detector can
    pin the source_field_path of each signal.
    """
    parts: list[str] = []
    paths: dict[str, list[str]] = {}

    def add(path: str, value: Any) -> None:
        if isinstance(value, str) and value.strip():
            parts.append(value)
            paths.setdefault("__all__", []).append(path)

    for k in ("title", "name", "organization_name"):
        add(k, extracted.get(k))

    posts = extracted.get("posts")
    if isinstance(posts, list):
        for i, p in enumerate(posts):
            if not isinstance(p, dict):
                continue
            for k in (
                "post_name", "education_required", "raw_requirement_text",
                "selection_process",
            ):
                add(f"posts[{i}].{k}", p.get(k))
            for k in ("language_requirements", "disciplines"):
                v = p.get(k)
                if isinstance(v, list):
                    for j, x in enumerate(v):
                        add(f"posts[{i}].{k}[{j}]", x if isinstance(x, str) else str(x))

    # Top-level free-form fields the extractor occasionally emits.
    for k in ("eligibility_summary", "notes", "general_instructions"):
        add(k, extracted.get(k))

    return " ".join(parts), paths


def detect_complexity(extracted_data: dict[str, Any] | None) -> list[EligibilityComplexitySignal]:
    """Return all complexity signals fired by the extracted payload.

    Each detector contributes at most one signal — multiple matches
    inside one payload don't multiply the same flag. The
    ``source_field_path`` is the first text path that matched; the
    full set of contributing paths would be noise for the admin UI.
    """
    if not extracted_data:
        return []
    text, paths = _gather_text(extracted_data)
    if not text:
        return []
    text_lower = text.lower()
    out: list[EligibilityComplexitySignal] = []
    for d in _COMPILED:
        match_path = None
        for rx in d["regexes"]:
            if rx.search(text_lower):
                # Find one source path for the audit trail. We don't
                # know exactly which sub-string matched which path, so
                # pick the first text-bearing path the gatherer recorded.
                paths_for_signal = paths.get("__all__", [])
                if paths_for_signal:
                    match_path = paths_for_signal[0]
                break
        if match_path is None:
            continue
        out.append(EligibilityComplexitySignal(
            flag=d["flag"],
            field_key=d["field_key"],
            source_field_path=match_path,
            blocking_level=d["blocking_level"],
        ))
    return out


__all__ = [
    "EligibilityComplexitySignal",
    "detect_complexity",
]
