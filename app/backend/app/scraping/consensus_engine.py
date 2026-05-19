"""Consensus engine for the Recruitment Verification Gateway (PR plan §4).

Compares high-risk fields across multiple sources that have surfaced
the *same* recruitment (i.e. queue items with matching identity keys)
and produces a list of :class:`VerificationConflict` rows.

Conflict rules:

* Official source wins over aggregator. An aggregator-only value can
  never become canonical — those are silently ignored from the
  canonical-truth pick, NOT recorded as conflicts unless they
  contradict an official source.
* Two official sources that disagree → conflict needing admin review.
* A field that has only one observation (single source, single value)
  is never a conflict regardless of source trust.

Comparison fields are a fixed list — adding a new one is a deliberate
gate change, not something we want to drift implicitly from the
extracted-data schema.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from typing import Any, Iterable
from urllib.parse import urlparse


logger = logging.getLogger(__name__)


# ── Fields the engine compares ────────────────────────────────────────
#
# Plan §4 final list. The hash-relevant subset is a strict superset of
# what verification_hash.py snapshots — consensus also cares about
# age_min/max, education, discipline, category_relaxation because those
# are eligibility-engine inputs even though they don't change identity.

CONSENSUS_FIELDS: tuple[str, ...] = (
    "title",
    "organization_name",
    "notification_number",
    "apply_start_date",
    "apply_end_date",
    "total_vacancies",
    "post_names",
    "age_min",
    "age_max",
    "education_required",
    "discipline_required",
    "category_relaxation",
    "official_notification_url",
    "official_apply_url",
    "source_pdf_url",
)


# Source trust tiers as the engine sees them. The values come from
# either ``source_registry.trust_tier`` or the host-suffix heuristic
# we used in PR2's resolver. ``official`` outranks ``aggregator``.

_OFFICIAL_HOST_SUFFIXES: tuple[str, ...] = (".gov.in", ".nic.in", ".ac.in", ".edu.in")


@dataclass
class SourceObservation:
    """One observation of a field's value, tagged with its source trust."""

    source: str               # short identifier, e.g. "queue:<id>" or "canonical"
    host: str | None
    trust: str                # 'official' | 'aggregator' | 'unknown'
    field_path: str
    value: Any


@dataclass
class FieldConflict:
    """Result of comparing one field across multiple observations."""

    conflict_id: str
    conflict_key: str
    field_path: str
    values: list[dict[str, Any]]


@dataclass
class ConsensusResult:
    """Aggregate engine output for one report."""

    conflicts: list[FieldConflict] = field(default_factory=list)
    has_unresolved: bool = False
    canonical_values: dict[str, Any] = field(default_factory=dict)


def _trust_of(host: str | None, *, source_registry_tier: str | None = None) -> str:
    """Classify a host into an engine trust tier.

    ``source_registry.trust_tier`` (if available) overrides the
    host-suffix heuristic — admins explicitly mark sources, and that
    decision dominates.
    """
    if source_registry_tier in {"official", "verified_official"}:
        return "official"
    if source_registry_tier == "aggregator":
        return "aggregator"
    if host:
        if any(host.endswith(s) for s in _OFFICIAL_HOST_SUFFIXES):
            return "official"
    return "unknown"


def _host_of(url: str | None) -> str | None:
    if not url:
        return None
    try:
        return urlparse(url).netloc.lower() or None
    except Exception:  # noqa: BLE001
        return None


def _norm_value(value: Any) -> Any:
    """Normalise a value for comparison.

    Strings → lower + stripped. Lists → sorted lower-trimmed. Ints kept
    as ints. Dates are compared as strings (callers pass the normalised
    YYYY-MM-DD form from the extractor / verification_hash output).
    """
    if value is None:
        return None
    if isinstance(value, str):
        return value.strip().lower() or None
    if isinstance(value, (list, tuple)):
        out = sorted({_norm_value(v) for v in value if _norm_value(v) is not None})
        return tuple(out) if out else None
    if isinstance(value, bool):
        return value
    return value


def _extract_post_names(extracted: dict[str, Any]) -> list[str]:
    posts = extracted.get("posts")
    if not isinstance(posts, list):
        return []
    out: list[str] = []
    for p in posts:
        if isinstance(p, dict):
            name = p.get("post_name")
            if isinstance(name, str):
                out.append(name)
    return out


def _flatten_observation(
    source_label: str,
    host: str | None,
    trust: str,
    extracted: dict[str, Any],
) -> list[SourceObservation]:
    """Project an extracted-data blob into per-field observations."""
    observations: list[SourceObservation] = []
    for field_name in CONSENSUS_FIELDS:
        if field_name == "post_names":
            value = _extract_post_names(extracted)
        else:
            value = extracted.get(field_name)
        norm = _norm_value(value)
        if norm in (None, "", (), []):
            continue
        observations.append(SourceObservation(
            source=source_label, host=host, trust=trust,
            field_path=field_name, value=norm,
        ))
    return observations


def collect_observations(
    *,
    primary_queue_item: dict[str, Any],
    primary_source: dict[str, Any] | None,
    peer_queue_items: Iterable[dict[str, Any]] = (),
    peer_sources: dict[str, dict[str, Any]] | None = None,
) -> list[SourceObservation]:
    """Build the flat observation list from one queue item + peers.

    The primary item is always included; peers come from a duplicate
    suggestion pass (e.g. queue rows that the dedup engine flagged as
    likely matches). ``peer_sources`` maps queue_item_id → source row
    so the trust tier is available without re-querying.
    """
    out: list[SourceObservation] = []
    primary_host = _host_of(primary_queue_item.get("source_url"))
    primary_trust = _trust_of(
        primary_host,
        source_registry_tier=(primary_source or {}).get("trust_tier"),
    )
    out.extend(_flatten_observation(
        f"queue:{primary_queue_item['id']}",
        primary_host, primary_trust,
        primary_queue_item.get("extracted_data") or {},
    ))
    peer_sources = peer_sources or {}
    for peer in peer_queue_items:
        host = _host_of(peer.get("source_url"))
        trust = _trust_of(host, source_registry_tier=(peer_sources.get(peer["id"]) or {}).get("trust_tier"))
        out.extend(_flatten_observation(
            f"queue:{peer['id']}",
            host, trust,
            peer.get("extracted_data") or {},
        ))
    return out


def _make_conflict_id() -> str:
    """uuid4 string — exposed as a hook so tests can monkeypatch deterministically."""
    return str(uuid.uuid4())


def compare_observations(
    observations: Iterable[SourceObservation],
) -> ConsensusResult:
    """Group observations by field and produce the conflict list.

    Rules:

    * One distinct value across all observations → no conflict; the
      canonical value is that single value.
    * Multiple distinct values, all from aggregator sources → no
      conflict recorded; canonical is left unset (aggregator-only
      can't become canonical truth).
    * At least one official source present:
        - If all officials agree → that value is canonical; non-matching
          aggregator values are ignored.
        - If officials disagree → conflict recorded (officials-vs-officials).
    * Single official + disagreeing aggregator → no conflict (official
      wins silently; aggregator value not recorded as a conflict).
    """
    by_field: dict[str, list[SourceObservation]] = {}
    for obs in observations:
        by_field.setdefault(obs.field_path, []).append(obs)

    result = ConsensusResult()
    for field_name, obs_list in by_field.items():
        distinct_values: dict[Any, list[SourceObservation]] = {}
        for o in obs_list:
            distinct_values.setdefault(o.value, []).append(o)

        if len(distinct_values) == 1:
            # Unanimous. Canonical = the only value seen.
            result.canonical_values[field_name] = next(iter(distinct_values.keys()))
            continue

        official_groups = {
            v: obs for v, obs in distinct_values.items()
            if any(o.trust == "official" for o in obs)
        }
        if not official_groups:
            # No official observations; aggregator-only disagreement
            # is not a canonical-truth question per plan §4.
            continue

        if len(official_groups) == 1:
            # Single official value vs aggregator noise — official wins
            # silently. The canonical row records the official value.
            chosen_value = next(iter(official_groups.keys()))
            result.canonical_values[field_name] = chosen_value
            continue

        # Two or more distinct values backed by official sources — real
        # conflict that needs admin attention.
        values_payload: list[dict[str, Any]] = []
        for value, obs in distinct_values.items():
            # Confidence proxy: 1.0 when any official source reports it,
            # 0.5 otherwise. Real confidence is the resolver's job; this
            # is only used to bias the admin UI.
            confidence = 1.0 if any(o.trust == "official" for o in obs) else 0.5
            for o in obs:
                values_payload.append({
                    "source": o.source,
                    "value": value if not isinstance(value, tuple) else list(value),
                    "confidence": confidence,
                })
        conflict = FieldConflict(
            conflict_id=_make_conflict_id(),
            conflict_key=f"{field_name}.official_disagreement",
            field_path=field_name,
            values=values_payload,
        )
        result.conflicts.append(conflict)
        result.has_unresolved = True
    return result


def has_unresolved_conflict(report: dict[str, Any]) -> bool:
    """Return True if any conflict on the report still has ``status='open'``."""
    for c in report.get("conflicts") or []:
        if (c or {}).get("status", "open") == "open":
            return True
    return False


__all__ = [
    "CONSENSUS_FIELDS",
    "ConsensusResult",
    "FieldConflict",
    "SourceObservation",
    "collect_observations",
    "compare_observations",
    "has_unresolved_conflict",
]
