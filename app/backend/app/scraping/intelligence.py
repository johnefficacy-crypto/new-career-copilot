"""Item classification + duplicate-candidate suggestions for admin queue.

Phase 7 of the audit tightened two things:

* ``classify_item`` no longer flags every "private" / "walk-in" mention
  as a private job. That false-positively blocked legitimate posts like
  *Private Secretary* and walk-in interviews held by government bodies.
  The classifier is now policy-aware: government hosts (.gov.in /
  .nic.in) and government org_types are never labelled private.
* ``duplicate_candidates`` runs through :func:`dedup.find_duplicate` so
  the admin queue's duplicate suggestions agree with the runner's own
  duplicate detection. Previously they used two different scoring
  algorithms and could disagree on the same row.
"""
from __future__ import annotations

from typing import Any

from .dedup import find_duplicate
from .extractor import recruitment_key


BLOCKED = {"private_job", "tender", "coaching_ad", "blog_only", "irrelevant"}


_GOVT_HOST_HINTS = (".gov.in", ".nic.in", ".ac.in", ".edu.in")
_GOVT_ORG_TYPES = {"UPSC", "SSC", "Banking", "Railway", "State", "Insurance", "Defence"}
_GOVT_TITLE_HINTS = (
    "commission", "recruitment", "vacancy", "notification", "government",
    "sarkari", "ministry", "department", "psu", "psc",
)


def _looks_like_government(item: dict[str, Any]) -> bool:
    """Tag whether an item is clearly from a government context."""
    extracted = item.get("extracted_data") or {}
    if isinstance(extracted, dict):
        org_type = extracted.get("org_type")
        if isinstance(org_type, str) and org_type in _GOVT_ORG_TYPES:
            return True
    source_url = (item.get("source_url") or "").lower()
    if any(h in source_url for h in _GOVT_HOST_HINTS):
        return True
    title = ""
    if isinstance(extracted, dict):
        title = (extracted.get("title") or extracted.get("name") or "")
    title_lower = title.lower()
    return any(hint in title_lower for hint in _GOVT_TITLE_HINTS)


def classify_item(item: dict[str, Any]) -> dict[str, Any]:
    extracted = item.get("extracted_data") if isinstance(item.get("extracted_data"), dict) else {}
    text = " ".join(
        str(x or "")
        for x in [
            item.get("source_name"),
            item.get("source_url"),
            extracted.get("title"),
            extracted.get("name"),
        ]
    ).lower()
    reasons: list[str] = []

    def has(*needles: str) -> bool:
        return any(n in text for n in needles)

    is_govt = _looks_like_government(item)

    cat = "unknown"
    evt = "other"
    conf = 55

    # Lifecycle events are checked first so admit_card / result / etc. don't
    # get mis-routed by later keyword rules.
    if has("admit card"):
        cat = "admit_card"; evt = "admit_card"; conf = 85
    elif has("result", "score card"):
        cat = "result"; evt = "result"; conf = 85
    elif has("answer key"):
        cat = "answer_key"; evt = "answer_key"; conf = 85
    elif has("corrigendum", "addendum"):
        cat = "corrigendum"; evt = "corrigendum"; conf = 85
    elif has("date extended", "last date extended"):
        cat = "date_extended"; evt = "date_extended"; conf = 80
    elif has("calendar"):
        cat = "exam_calendar"; evt = "calendar"; conf = 70
    # Private / tender / coaching only when *not* clearly government.
    elif has("tender", "eoi", "bid"):
        cat = "tender"; conf = 90; reasons.append("tender keywords")
    elif has("coaching", "admission open", "batch"):
        cat = "coaching_ad"; conf = 88
    elif has("blog", "opinion", "tips"):
        cat = "blog_only"; conf = 75
    elif (has("private", "walk-in", "walk in", "mnc") and not is_govt):
        cat = "private_job"; conf = 90; reasons.append("private keywords (no government context)")
    # Recruitment buckets.
    elif has("railway", "rrb"):
        cat = "railway"; evt = "new_recruitment"; conf = 80
    elif has("bank", "ibps", "sbi", "rbi"):
        cat = "banking_recruitment"; evt = "new_recruitment"; conf = 80
    elif has("psu", "corporation", "limited"):
        cat = "psu_recruitment"; evt = "new_recruitment"; conf = 75
    elif has("commission", "recruitment", "vacancy", "notification"):
        cat = "government_recruitment"; evt = "new_recruitment"; conf = 75
    elif is_govt:
        cat = "government_recruitment"; evt = "new_recruitment"; conf = 65
        reasons.append("government context inferred")

    relevant = cat not in BLOCKED
    return {
        "relevance_category": cat,
        "is_recruitment_relevant": relevant,
        "lifecycle_event_type": evt,
        "confidence": conf,
        "reasons": reasons,
    }


def duplicate_candidates(
    extracted: dict[str, Any],
    existing: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Suggest duplicate canonical recruitments for an admin queue row.

    Wraps :func:`dedup.find_duplicate` so the queue UI's duplicate hints
    agree with the runner's automatic dedup decision. We collect every
    candidate (not just the highest-scoring match) by running the dedup
    engine against each existing recruitment in turn and keeping the ones
    it flags as duplicates.
    """
    title = extracted.get("title") or extracted.get("name") or ""
    sim_key = recruitment_key(extracted.get("organization_name"), extracted.get("year"), title)
    out: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for r in existing:
        decision = find_duplicate(
            extracted,
            sim_key=sim_key,
            existing_recruitments=[r],
            queued={},
        )
        if not decision.is_duplicate:
            continue
        rec_id = decision.duplicate_recruitment_id or r.get("id")
        if rec_id in seen_ids:
            continue
        seen_ids.add(rec_id)
        out.append({
            "recruitment_id": rec_id,
            "name": r.get("name"),
            "score": decision.score,
            "reasons": [decision.reason] if decision.reason else [],
            "matched_fields": list(decision.matched_fields),
        })
    return sorted(out, key=lambda x: x["score"], reverse=True)
