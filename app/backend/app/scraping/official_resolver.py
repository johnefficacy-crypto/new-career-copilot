"""Official-source resolver waterfall (PR plan §3).

Layers (deterministic; L6 AI deferred):

    L1  direct official links on scraped page
    L2  duplicate/open queue official URL reuse
    L3  existing canonical recruitment match
    L4  source_registry parent/career page
    L5  official sitemap/RSS/API lookup  (uses cached sitemap_url; no live fetch)
    L7  admin fallback                   (always available; no resolver work)

Slow remote work never blocks the scrape run. The resolver only uses
data already present in the queue payload, the canonical tables, or
``source_registry`` — including any cached sitemap URL captured by the
fetcher. Live sitemap crawling is deferred to a later PR with its own
budget guard.

Confidence bands (from ``verification_policy.OFFICIAL_RESOLUTION_THRESHOLDS``):

    ≥ 0.85       → status = 'auto_resolved'
    0.60 – 0.85  → status = 'suggested', recommended_action = 'confirm_suggested_proof'
    < 0.60       → status = 'unresolved', recommended_action = 'await_official_proof'

The resolver writes one ``official_resolution_attempts`` row per
layer attempt (success or error). The orchestrator interprets the
final state and writes onto the verification report.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Iterable
from urllib.parse import urlparse

from supabase import Client

from .verification_policy import OFFICIAL_RESOLUTION_THRESHOLDS


logger = logging.getLogger(__name__)


# Host suffix → "this is a govt source" weighting. Used to bias L1's
# direct-link detection. Aggregator hosts never satisfy the gate.
_GOVT_HOST_SUFFIXES: tuple[str, ...] = (".gov.in", ".nic.in", ".ac.in", ".edu.in")
_AGGREGATOR_HOST_HINTS: tuple[str, ...] = (
    "sarkariresult", "freejobalert", "naukri", "rojgar",
    "indgovtjobs", "jobriya", "govtjobcafe",
)


@dataclass
class ResolverCandidate:
    """One candidate URL produced by an L-stage.

    The candidate's ``method`` matches the schema's ``OfficialUrlMethod``
    enum. ``evidence_summary_key`` is optional — populated when the L-stage
    has snippet evidence to attach to the report.
    """

    url: str
    url_type: str = "unknown"
    method: str = "direct_link"
    confidence: float = 0.0
    source_id: str | None = None
    host: str | None = None
    evidence_summary_key: str | None = None


@dataclass
class ResolverResult:
    """Aggregated outcome across all L-stages for one report."""

    status: str = "unresolved"
    chosen: ResolverCandidate | None = None
    suggested: list[ResolverCandidate] = field(default_factory=list)
    attempts: list[dict[str, Any]] = field(default_factory=list)
    recommended_action: str | None = None


def _host_of(url: str | None) -> str | None:
    if not url:
        return None
    try:
        host = urlparse(url).netloc.lower()
    except Exception:  # noqa: BLE001
        return None
    return host or None


def _is_govt_host(host: str | None) -> bool:
    if not host:
        return False
    return any(host.endswith(s) for s in _GOVT_HOST_SUFFIXES)


def _is_aggregator_host(host: str | None) -> bool:
    if not host:
        return False
    return any(hint in host for hint in _AGGREGATOR_HOST_HINTS)


def _classify_url_type(url: str | None, hint: str = "") -> str:
    """Guess a URL's role from its shape + a hint.

    Hint is one of the field names we pulled the URL from
    (``official_notification_url``, ``official_apply_url``, ``source_pdf_url``).
    The hint dominates; the URL shape is a fallback signal.
    """
    if "notification" in hint:
        return "notification"
    if "apply" in hint:
        return "apply"
    if "pdf" in hint or (url or "").lower().endswith(".pdf"):
        return "pdf"
    return "unknown"


# ── L1 — direct official links on the scraped page ────────────────────


_L1_FIELDS: tuple[str, ...] = (
    "official_notification_url",
    "official_apply_url",
    "source_pdf_url",
)


def resolve_l1_direct_links(extracted_data: dict[str, Any]) -> list[ResolverCandidate]:
    """L1: pull direct official-looking URLs from the extracted payload.

    A URL on a govt host scores 0.92 (auto_resolve). A non-govt host
    that's clearly an aggregator is excluded entirely — aggregator
    pages never satisfy the official-source gate (plan §3 acceptance).
    A non-govt non-aggregator URL scores 0.55 (sub-suggest threshold) —
    we keep it as a low-confidence attempt for audit but it won't
    promote to suggested without another layer concurring.
    """
    out: list[ResolverCandidate] = []
    for field_name in _L1_FIELDS:
        url = extracted_data.get(field_name)
        if not isinstance(url, str) or not url.strip():
            continue
        host = _host_of(url)
        if _is_aggregator_host(host):
            continue
        if _is_govt_host(host):
            confidence = 0.92
        else:
            confidence = 0.55
        out.append(ResolverCandidate(
            url=url.strip(),
            url_type=_classify_url_type(url, hint=field_name),
            method="direct_link",
            confidence=confidence,
            host=host,
        ))
    return out


# ── L2 — duplicate/open queue official URL reuse ──────────────────────


def resolve_l2_duplicate_queue(
    supabase: Client,
    *,
    organization_name: str | None,
    notification_number: str | None,
) -> list[ResolverCandidate]:
    """L2: reuse an official URL from another open queue item.

    If two scrape_queue rows agree on (organization_name,
    notification_number) and one of them already has a resolved
    official URL on its verification report, the other can ride along
    at high confidence — the inter-source agreement is the signal.
    """
    if not organization_name or not notification_number:
        return []
    try:
        rows = (
            supabase.table("recruitment_verification_reports")
            .select("id, official_resolution_status, suggested_official_urls, scrape_queue_id")
            .eq("official_resolution_status", "auto_resolved")
            .limit(20)
            .execute()
            .data
            or []
        )
    except Exception:  # noqa: BLE001
        logger.exception("resolver.l2_query_failed")
        return []
    out: list[ResolverCandidate] = []
    for r in rows:
        for u in r.get("suggested_official_urls") or []:
            host = u.get("host") or _host_of(u.get("url"))
            if not _is_govt_host(host):
                continue
            out.append(ResolverCandidate(
                url=u["url"],
                url_type=u.get("url_type", "unknown"),
                method="duplicate",
                confidence=0.80,
                host=host,
            ))
    return out


# ── L3 — existing canonical recruitment match ────────────────────────


def resolve_l3_canonical_match(
    supabase: Client,
    *,
    organization_name: str | None,
    title: str | None,
    year: int | None,
) -> list[ResolverCandidate]:
    """L3: look for an existing canonical recruitment with an official URL.

    The canonical row was admin-promoted at some point, so anything it
    surfaces is high-trust (0.90).
    """
    if not title:
        return []
    try:
        q = supabase.table("recruitments").select(
            "id, name, official_notification_url, official_apply_url"
        )
        if year is not None:
            q = q.eq("year", year)
        rows = q.limit(50).execute().data or []
    except Exception:  # noqa: BLE001
        logger.exception("resolver.l3_query_failed")
        return []
    title_l = title.lower()
    out: list[ResolverCandidate] = []
    for r in rows:
        name = (r.get("name") or "").lower()
        # Loose match — substring either direction. The canonical row
        # exists; the URL on it is the authoritative copy.
        if not (title_l in name or name in title_l):
            continue
        for col in ("official_notification_url", "official_apply_url"):
            url = r.get(col)
            if not url:
                continue
            host = _host_of(url)
            if not _is_govt_host(host):
                continue
            out.append(ResolverCandidate(
                url=url,
                url_type=_classify_url_type(url, hint=col),
                method="canonical_match",
                confidence=0.90,
                host=host,
            ))
    return out


# ── L4 — source_registry parent / career page ───────────────────────


def resolve_l4_source_registry(source: dict[str, Any] | None) -> list[ResolverCandidate]:
    """L4: pull the ``official_url`` and career-page URL off source_registry.

    Lower confidence than L1/L3 because the registry entry might be a
    "homepage" rather than a specific notification — but it's still a
    govt source, so 0.70 sits in the suggest band.
    """
    if not source or not isinstance(source, dict):
        return []
    out: list[ResolverCandidate] = []
    for col in ("official_url", "career_page_url"):
        url = source.get(col)
        if not isinstance(url, str) or not url.strip():
            continue
        host = _host_of(url)
        if _is_aggregator_host(host):
            continue
        confidence = 0.70 if _is_govt_host(host) else 0.50
        out.append(ResolverCandidate(
            url=url.strip(),
            url_type="career_page" if "career" in col else "unknown",
            method="source_registry",
            confidence=confidence,
            source_id=source.get("id"),
            host=host,
        ))
    return out


# ── L5 — cached sitemap / RSS / API lookup ───────────────────────────


def resolve_l5_sitemap_cached(source: dict[str, Any] | None) -> list[ResolverCandidate]:
    """L5: surface a cached sitemap URL from the source row.

    A "live" sitemap crawl would block the scrape pass — deferred. If
    the fetcher has previously cached a sitemap_url / rss_url onto the
    source_registry row, we surface it as a low-confidence candidate so
    the admin sees it as a suggestion.
    """
    if not source or not isinstance(source, dict):
        return []
    out: list[ResolverCandidate] = []
    for col in ("sitemap_url", "rss_url"):
        url = source.get(col)
        if not isinstance(url, str) or not url.strip():
            continue
        host = _host_of(url)
        if not _is_govt_host(host):
            # Aggregator-hosted RSS is not an official source.
            continue
        out.append(ResolverCandidate(
            url=url.strip(),
            url_type="unknown",
            method="sitemap",
            confidence=0.65,
            source_id=source.get("id"),
            host=host,
        ))
    return out


# ── Waterfall orchestration ──────────────────────────────────────────


def _attempt_record(
    *,
    method: str,
    status: str,
    confidence: float | None,
    candidate_url: str | None,
    host: str | None,
    rejection_reason: str | None = None,
) -> dict[str, Any]:
    """Build one row for ``official_resolution_attempts``.

    The orchestrator writes this list out as a batch after the resolver
    finishes, so we don't take a DB write per L-stage.
    """
    return {
        "method": method,
        "status": status,
        "confidence": confidence,
        "candidate_url": candidate_url,
        "official_source_host": host,
        "rejection_reason": rejection_reason,
    }


def _band(confidence: float) -> str:
    if confidence >= OFFICIAL_RESOLUTION_THRESHOLDS["auto_resolve"]:
        return "auto_resolved"
    if confidence >= OFFICIAL_RESOLUTION_THRESHOLDS["suggest_for_admin"]:
        return "suggested"
    return "low_confidence"


def _safe_call(fn, *args, **kwargs) -> tuple[list[ResolverCandidate], str | None]:
    """Call a resolver stage; catch + log exceptions, return ([], reason)."""
    try:
        return list(fn(*args, **kwargs) or []), None
    except Exception as exc:  # noqa: BLE001
        logger.exception("resolver.stage_failed fn=%s", fn.__name__)
        return [], f"{type(exc).__name__}: {exc}"


def run_resolver_waterfall(
    supabase: Client,
    *,
    extracted_data: dict[str, Any] | None,
    source: dict[str, Any] | None = None,
    organization_name: str | None = None,
    notification_number: str | None = None,
    title: str | None = None,
    year: int | None = None,
) -> ResolverResult:
    """Run L1–L5 and decide ``auto_resolved`` / ``suggested`` / ``unresolved``.

    L1 candidates always include the original ``official_*_url`` fields
    from the extracted payload, so the resolver is idempotent across
    re-runs unless the upstream data drifts.
    """
    extracted = extracted_data or {}
    result = ResolverResult()
    all_candidates: list[ResolverCandidate] = []

    # L1
    l1, err = _safe_call(resolve_l1_direct_links, extracted)
    if err:
        result.attempts.append(_attempt_record(
            method="direct_link", status="error",
            confidence=None, candidate_url=None, host=None,
            rejection_reason=err,
        ))
    for c in l1:
        result.attempts.append(_attempt_record(
            method="direct_link",
            status=_band(c.confidence),
            confidence=c.confidence,
            candidate_url=c.url,
            host=c.host,
        ))
        all_candidates.append(c)

    # L2
    l2, err = _safe_call(
        resolve_l2_duplicate_queue, supabase,
        organization_name=organization_name,
        notification_number=notification_number,
    )
    if err:
        result.attempts.append(_attempt_record(
            method="duplicate", status="error",
            confidence=None, candidate_url=None, host=None,
            rejection_reason=err,
        ))
    for c in l2:
        result.attempts.append(_attempt_record(
            method="duplicate",
            status=_band(c.confidence),
            confidence=c.confidence,
            candidate_url=c.url,
            host=c.host,
        ))
        all_candidates.append(c)

    # L3
    l3, err = _safe_call(
        resolve_l3_canonical_match, supabase,
        organization_name=organization_name, title=title, year=year,
    )
    if err:
        result.attempts.append(_attempt_record(
            method="canonical_match", status="error",
            confidence=None, candidate_url=None, host=None,
            rejection_reason=err,
        ))
    for c in l3:
        result.attempts.append(_attempt_record(
            method="canonical_match",
            status=_band(c.confidence),
            confidence=c.confidence,
            candidate_url=c.url,
            host=c.host,
        ))
        all_candidates.append(c)

    # L4
    l4, err = _safe_call(resolve_l4_source_registry, source)
    if err:
        result.attempts.append(_attempt_record(
            method="source_registry", status="error",
            confidence=None, candidate_url=None, host=None,
            rejection_reason=err,
        ))
    for c in l4:
        result.attempts.append(_attempt_record(
            method="source_registry",
            status=_band(c.confidence),
            confidence=c.confidence,
            candidate_url=c.url,
            host=c.host,
        ))
        all_candidates.append(c)

    # L5
    l5, err = _safe_call(resolve_l5_sitemap_cached, source)
    if err:
        result.attempts.append(_attempt_record(
            method="sitemap", status="error",
            confidence=None, candidate_url=None, host=None,
            rejection_reason=err,
        ))
    for c in l5:
        result.attempts.append(_attempt_record(
            method="sitemap",
            status=_band(c.confidence),
            confidence=c.confidence,
            candidate_url=c.url,
            host=c.host,
        ))
        all_candidates.append(c)

    if not all_candidates:
        result.status = "unresolved"
        result.recommended_action = "await_official_proof"
        return result

    # Highest-confidence wins. Ties broken by stage order (L1 > L2 > ...).
    all_candidates.sort(key=lambda c: c.confidence, reverse=True)
    best = all_candidates[0]
    band = _band(best.confidence)
    if band == "auto_resolved":
        result.status = "auto_resolved"
        result.chosen = best
        result.suggested = [best]
        # recommended_action stays as whatever the report had — usually
        # 'request_admin_review'; the resolver doesn't promote on its own.
        result.recommended_action = None
    elif band == "suggested":
        result.status = "suggested"
        # Keep every distinct suggested+ candidate (dedup by url).
        seen: set[str] = set()
        for c in all_candidates:
            if _band(c.confidence) == "low_confidence":
                continue
            if c.url in seen:
                continue
            seen.add(c.url)
            result.suggested.append(c)
        result.recommended_action = "confirm_suggested_proof"
    else:
        result.status = "unresolved"
        result.recommended_action = "await_official_proof"

    return result


def write_resolution_attempts(
    supabase: Client,
    *,
    verification_report_id: str,
    scrape_queue_id: str | None,
    source_id: str | None,
    attempts: Iterable[dict[str, Any]],
) -> None:
    """Persist resolver attempts.

    Best-effort: if the table doesn't exist (older deploy) or the insert
    fails, log and continue. Attempts are an audit trail, not a gate —
    a missing attempt row never blocks the resolver from setting state
    on the verification report.
    """
    payloads = []
    for a in attempts:
        payloads.append({
            **a,
            "verification_report_id": verification_report_id,
            "scrape_queue_id": scrape_queue_id,
            "source_id": source_id,
        })
    if not payloads:
        return
    try:
        supabase.table("official_resolution_attempts").insert(payloads).execute()
    except Exception:  # noqa: BLE001
        logger.exception(
            "resolver.attempt_log_failed verification_report_id=%s",
            verification_report_id,
        )


__all__ = [
    "ResolverCandidate",
    "ResolverResult",
    "resolve_l1_direct_links",
    "resolve_l2_duplicate_queue",
    "resolve_l3_canonical_match",
    "resolve_l4_source_registry",
    "resolve_l5_sitemap_cached",
    "run_resolver_waterfall",
    "write_resolution_attempts",
]
